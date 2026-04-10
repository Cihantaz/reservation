from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RESERVATION_", env_file=".env")

    database_url: str = "sqlite:///./reservation.db"
    otp_ttl_seconds: int = 300
    session_ttl_seconds: int = 60 * 60 * 12
    lock_ttl_seconds: int = 180
    login_email_domain: str = "@isikun.edu.tr"
    allow_origin: str = "http://localhost:5173"
    allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    enable_dev_token: bool = False
    resend_api_base: str = "https://api.resend.com"
    resend_api_key: str = ""
    resend_domain: str = ""
    resend_from_local_part: str = "oidbotomasyon.reservation"
    resend_from_name: str = "OIDB Reservation"
    resend_reply_to: str = ""
    bootstrap_login_email: str = ""
    bootstrap_login_secret: str = ""

    @property
    def cors_origins(self) -> list[str]:
        raw = self.allow_origins or self.allow_origin
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def resend_from_email(self) -> str:
        local_part = self.resend_from_local_part.strip()
        domain = self.resend_domain.strip()
        if not local_part or not domain:
            return ""
        return f"{local_part}@{domain}"


settings = Settings()

