import logging
import secrets
import string
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .mailer import send_otp_email
from .models import AuditLog, OtpRequest, SessionToken, User, UserRole
from .settings import settings
from .utils import utcnow


logger = logging.getLogger(__name__)


def _new_otp_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


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

    if otp.expires_at < utcnow():
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

    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(seconds=settings.session_ttl_seconds)
    sess = SessionToken(token=token, user_id=user.id, expires_at=expires_at)
    db.add(sess)

    _log(db, actor=email, action="auth.login", entity="user", entity_id=str(user.id), detail="OTP ile giris.")
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
    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Giris gerekli.")

    sess = db.scalar(select(SessionToken).where(SessionToken.token == token))
    if not sess:
        raise HTTPException(status_code=401, detail="Gecersiz oturum.")
    if sess.expires_at < utcnow():
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
