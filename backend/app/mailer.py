import json
import logging
from urllib import error, request

from fastapi import HTTPException

from .settings import settings


logger = logging.getLogger(__name__)


def _sender_header() -> str:
    sender_email = settings.resend_from_email
    if not sender_email:
        raise HTTPException(status_code=500, detail="OTP e-posta gonderimi icin gonderici adresi ayarlanmamis.")

    sender_name = settings.resend_from_name.strip()
    if sender_name:
        return f"{sender_name} <{sender_email}>"
    return sender_email


def send_otp_email(email: str, code: str) -> None:
    if not settings.resend_api_key.strip():
        raise HTTPException(status_code=500, detail="OTP e-posta servisi henuz yapilandirilmamis.")

    payload = {
        "from": _sender_header(),
        "to": [email],
        "subject": "OTP Dogrulama Kodunuz",
        "text": (
            "Merhaba,\n\n"
            f"OTP kodunuz: {code}\n"
            f"Bu kod {settings.otp_ttl_seconds} saniye boyunca gecerlidir.\n\n"
            "Eger bu istegi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz."
        ),
        "html": (
            "<div style=\"font-family:Arial,sans-serif;line-height:1.6\">"
            "<p>Merhaba,</p>"
            "<p>OTP kodunuz:</p>"
            f"<p style=\"font-size:28px;font-weight:700;letter-spacing:4px\">{code}</p>"
            f"<p>Bu kod <strong>{settings.otp_ttl_seconds}</strong> saniye boyunca gecerlidir.</p>"
            "<p>Eger bu istegi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz.</p>"
            "</div>"
        ),
    }
    if settings.resend_reply_to.strip():
        payload["reply_to"] = settings.resend_reply_to.strip()

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=f"{settings.resend_api_base.rstrip('/')}/emails",
        data=body,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            response.read()
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("Resend HTTP error while sending OTP: %s", detail)
        raise HTTPException(status_code=502, detail="OTP e-postasi gonderilemedi. Lutfen tekrar deneyin.") from exc
    except error.URLError as exc:
        logger.error("Resend network error while sending OTP: %s", exc)
        raise HTTPException(status_code=502, detail="OTP e-posta servisine ulasilamadi.") from exc
