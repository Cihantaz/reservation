import logging
import json
import socket
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib import error, request

from fastapi import HTTPException

from .settings import settings


logger = logging.getLogger(__name__)


def _sender_header() -> str:
    return settings.smtp_sender_header


def _email_bodies(code: str) -> tuple[str, str, str]:
    subject = "OTP Dogrulama Kodunuz"
    text_body = (
        "Merhaba,\n\n"
        f"OTP kodunuz: {code}\n"
        f"Bu kod {settings.otp_ttl_seconds} saniye boyunca gecerlidir.\n\n"
        "Eger bu istegi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz."
    )
    html_body = (
        "<div style=\"font-family:Arial,sans-serif;line-height:1.6\">"
        "<p>Merhaba,</p>"
        "<p>OTP kodunuz:</p>"
        f"<p style=\"font-size:28px;font-weight:700;letter-spacing:4px\">{code}</p>"
        f"<p>Bu kod <strong>{settings.otp_ttl_seconds}</strong> saniye boyunca gecerlidir.</p>"
        "<p>Eger bu istegi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz.</p>"
        "</div>"
    )
    return subject, text_body, html_body


def send_otp_email(email: str, code: str) -> None:
    if settings.sendgrid_api_key.strip():
        _send_otp_email_sendgrid(email=email, code=code)
        return

    if not settings.smtp_host.strip():
        if settings.enable_dev_token:
            logger.info("[DEV MODE] OTP for %s: %s", email, code)
            return
        raise HTTPException(status_code=500, detail="SMTP sunucusu ayarlanmamis.")

    if not settings.smtp_username.strip() or not settings.smtp_password.strip():
        raise HTTPException(status_code=500, detail="SMTP kullanici adi / sifre ayarlanmamis.")

    subject, text_body, html_body = _email_bodies(code)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _sender_header()
    msg["To"] = email

    reply_to = settings.smtp_reply_to.strip()
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    timeout = max(1, min(settings.smtp_timeout_seconds, 5))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout) as server:
            if server.sock:
                server.sock.settimeout(timeout)
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                if server.sock:
                    server.sock.settimeout(timeout)
                server.ehlo()
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, [email], msg.as_string())
        logger.info("OTP email sent to %s via SMTP", email)
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP authentication error: %s", exc)
        raise HTTPException(status_code=500, detail="SMTP kimlik dogrulama hatasi.") from exc
    except (TimeoutError, socket.timeout) as exc:
        logger.error("SMTP timeout while sending OTP: %s", exc)
        raise HTTPException(status_code=504, detail="SMTP sunucusu zaman asimina ugradi. Host, port ve TLS ayarlarini kontrol edin.") from exc
    except smtplib.SMTPException as exc:
        logger.error("SMTP error while sending OTP: %s", exc)
        raise HTTPException(status_code=502, detail="OTP e-postasi gonderilemedi.") from exc
    except OSError as exc:
        logger.error("SMTP connection error while sending OTP: %s", exc)
        raise HTTPException(status_code=502, detail="SMTP sunucusuna baglanilamadi. Host ve port ayarlarini kontrol edin.") from exc
    except Exception as exc:
        logger.error("Unexpected error while sending OTP: %s", exc)
        raise HTTPException(status_code=500, detail="OTP e-postasi gonderilirken bir hata olustu.") from exc


def _send_otp_email_sendgrid(email: str, code: str) -> None:
    subject, text_body, html_body = _email_bodies(code)
    from_email = settings.sendgrid_from_email.strip() or settings.smtp_from_email.strip()
    from_name = settings.sendgrid_from_name.strip() or settings.smtp_from_name.strip()
    if not from_email:
        raise HTTPException(status_code=500, detail="SendGrid gonderici e-posta adresi ayarlanmamis.")

    payload = {
        "personalizations": [{"to": [{"email": email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body},
        ],
    }

    reply_to = settings.sendgrid_reply_to.strip() or settings.smtp_reply_to.strip()
    if reply_to:
        payload["reply_to"] = {"email": reply_to}

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=f"{settings.sendgrid_api_base.rstrip('/')}/v3/mail/send",
        data=body,
        headers={
            "Authorization": f"Bearer {settings.sendgrid_api_key.strip()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    timeout = max(3, min(settings.smtp_timeout_seconds, 10))
    try:
        with request.urlopen(req, timeout=timeout) as response:
            response.read()
        logger.info("OTP email sent to %s via SendGrid API", email)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("SendGrid API error while sending OTP: status=%s detail=%s", exc.code, detail)
        raise HTTPException(status_code=502, detail="SendGrid OTP e-postasini reddetti. API key ve sender adresini kontrol edin.") from exc
    except error.URLError as exc:
        logger.error("SendGrid API network error while sending OTP: %s", exc)
        raise HTTPException(status_code=502, detail="SendGrid API servisine ulasilamadi.") from exc
    except TimeoutError as exc:
        logger.error("SendGrid API timeout while sending OTP: %s", exc)
        raise HTTPException(status_code=504, detail="SendGrid API zaman asimina ugradi.") from exc
