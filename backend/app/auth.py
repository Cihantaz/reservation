import logging
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .mailer import send_otp_email
from .models import AuditLog, OtpRequest, SessionToken, User, UserRole
from .settings import settings
from .utils import utcnow


logger = logging.getLogger(__name__)
DIRECT_ADMIN_EMAIL = "cihan.tazeoz@isikun.edu.tr"


def _new_otp_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _issue_session_for_user(db: Session, user: User) -> SessionToken:
    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(seconds=settings.session_ttl_seconds)
    sess = SessionToken(token=token, user_id=user.id, expires_at=expires_at)
    db.add(sess)
    return sess


def _get_or_create_direct_admin(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == DIRECT_ADMIN_EMAIL))
    if not user:
        user = User(email=DIRECT_ADMIN_EMAIL, role=UserRole.admin, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    changed = False
    if user.role != UserRole.admin:
        user.role = UserRole.admin
        changed = True
    if not user.is_active:
        user.is_active = True
        changed = True
    if changed:
        db.commit()
        db.refresh(user)
    return user


def request_otp(db: Session, email: str) -> None:
    email = email.strip().lower()
    if not email.endswith(settings.login_email_domain):
        raise HTTPException(status_code=400, detail="Sadece isikun.edu.tr uzantili e-posta ile giris yapilabilir.")

    db.execute(delete(OtpRequest).where(OtpRequest.email == email))

    code = _new_otp_code()
    expires_at = utcnow() + timedelta(seconds=settings.otp_ttl_seconds)
    db.add(OtpRequest(email=email, code=code, expires_at=expires_at))

    send_otp_email(email=email, code=code)
    logger.info("OTP email sent to %s", email)
    _log(db, actor=email, action="otp.request", detail="OTP olusturuldu ve e-posta ile gonderildi.")


def verify_otp(db: Session, email: str, code: str) -> SessionToken:
    email = email.strip().lower()
    code = code.strip()

    otp = db.scalar(select(OtpRequest).where(OtpRequest.email == email))
    if not otp:
        raise HTTPException(status_code=400, detail="OTP istegi bulunamadi. Lutfen tekrar kod isteyin.")

    if _as_utc(otp.expires_at) < utcnow():
        db.execute(delete(OtpRequest).where(OtpRequest.id == otp.id))
        raise HTTPException(status_code=400, detail="OTP suresi doldu. Lutfen tekrar kod isteyin.")

    if otp.code != code:
        raise HTTPException(status_code=400, detail="OTP kodu hatali.")

    db.execute(delete(OtpRequest).where(OtpRequest.id == otp.id))

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, role=UserRole.user, is_active=True)
        db.add(user)
        db.flush()

    sess = _issue_session_for_user(db, user)

    _log(db, actor=email, action="auth.login", entity="user", entity_id=str(user.id), detail="OTP ile giris.")
    return sess


def bootstrap_login(db: Session, secret: str) -> SessionToken:
    expected_secret = settings.bootstrap_login_secret.strip()
    bootstrap_email = settings.bootstrap_login_email.strip().lower()

    if not expected_secret or not bootstrap_email:
        raise HTTPException(status_code=404, detail="Gecici giris devre disi.")
    if secret.strip() != expected_secret:
        raise HTTPException(status_code=401, detail="Gecersiz gecici giris anahtari.")

    user = db.scalar(select(User).where(User.email == bootstrap_email))
    if not user:
        user = User(email=bootstrap_email, role=UserRole.admin, is_active=True)
        db.add(user)
        db.flush()
    elif user.role != UserRole.admin:
        user.role = UserRole.admin

    sess = _issue_session_for_user(db, user)
    _log(db, actor=bootstrap_email, action="auth.bootstrap_login", entity="user", entity_id=str(user.id), detail="Gecici erisim baglantisi ile giris.")
    return sess


def test_login(db: Session, email: str, password: str) -> SessionToken:
    expected_email = settings.test_login_email.strip().lower()
    expected_password = settings.test_login_password.strip()
    email = email.strip().lower()
    password = password.strip()

    if not expected_email or not expected_password:
        raise HTTPException(status_code=404, detail="Gecici test girisi devre disi.")
    if email != expected_email or password != expected_password:
        raise HTTPException(status_code=401, detail="Test giris bilgileri hatali.")

    user = db.scalar(select(User).where(User.email == expected_email))
    if not user:
        user = User(email=expected_email, role=UserRole.admin, is_active=True)
        db.add(user)
        db.flush()
    elif user.role != UserRole.admin:
        user.role = UserRole.admin

    sess = _issue_session_for_user(db, user)
    _log(db, actor=expected_email, action="auth.test_login", entity="user", entity_id=str(user.id), detail="Gecici test sifresi ile giris.")
    return sess


def auto_login(db: Session) -> SessionToken:
    auto_email = settings.auto_login_email.strip().lower()
    if not auto_email:
        raise HTTPException(status_code=404, detail="Otomatik giris devre disi.")

    user = db.scalar(select(User).where(User.email == auto_email))
    if not user:
        user = User(email=auto_email, role=UserRole.admin, is_active=True)
        db.add(user)
        db.flush()
    elif user.role != UserRole.admin:
        user.role = UserRole.admin

    sess = _issue_session_for_user(db, user)
    _log(db, actor=auto_email, action="auth.auto_login", entity="user", entity_id=str(user.id), detail="Gecici otomatik giris ile oturum acildi.")
    return sess


def logout(db: Session, token: str, actor_email: str) -> None:
    db.execute(delete(SessionToken).where(SessionToken.token == token))
    _log(db, actor=actor_email, action="auth.logout", detail="Oturum kapatildi.")


def _get_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth:
        return None
    if not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    if settings.enable_dev_token:
        return _get_or_create_direct_admin(db)

    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Giris gerekli.")

    sess = db.scalar(select(SessionToken).where(SessionToken.token == token))
    if not sess:
        raise HTTPException(status_code=401, detail="Gecersiz oturum.")
    if _as_utc(sess.expires_at) < utcnow():
        db.execute(delete(SessionToken).where(SessionToken.id == sess.id))
        raise HTTPException(status_code=401, detail="Oturum suresi doldu.")

    user = db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Kullanici pasif.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Bu islem icin admin yetkisi gerekir.")
    return user


def _log(db: Session, actor: str, action: str, entity: str = "", entity_id: str = "", detail: str = "") -> None:
    db.add(AuditLog(actor_email=actor, action=action, entity=entity, entity_id=entity_id, detail=detail))
