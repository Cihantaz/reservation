import logging
import socket
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import HTTPException

from .settings import settings


logger = logging.getLogger(__name__)


def _sender_header() -> str:
    return settings.smtp_sender_header


def send_otp_email(email: str, code: str) -> None:
    if not settings.smtp_host.strip():
        if settings.enable_dev_token:
            logger.info("[DEV MODE] OTP for %s: %s", email, code)
            return
        raise HTTPException(status_code=500, detail="SMTP sunucusu ayarlanmamis.")

    if not settings.smtp_username.strip() or not settings.smtp_password.strip():
        raise HTTPException(status_code=500, detail="SMTP kullanici adi / sifre ayarlanmamis.")

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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _sender_header()
    msg["To"] = email

    reply_to = settings.smtp_reply_to.strip()
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    timeout = max(1, min(settings.smtp_timeout_seconds, 10))

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
