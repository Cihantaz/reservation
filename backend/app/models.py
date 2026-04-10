import enum
from datetime import date, datetime, time
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class ReservationStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reservations: Mapped[list["Reservation"]] = relationship(back_populates="user")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # room_code: "DMF-114" gibi, BaseSchedule eşleştirmesi için kritik
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    building: Mapped[str] = mapped_column(String(20), index=True, default="A")
    room_number: Mapped[str] = mapped_column(String(20), index=True, default="")
    feature: Mapped[str] = mapped_column(String(255), default="")
    class_capacity: Mapped[int] = mapped_column(Integer)
    exam_capacity: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("class_capacity >= 0", name="ck_room_class_capacity_nonneg"),
        CheckConstraint("exam_capacity >= 0", name="ck_room_exam_capacity_nonneg"),
    )


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # M1, M2...
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)

    __table_args__ = (
        CheckConstraint("start_time < end_time", name="ck_slot_start_before_end"),
    )


class BaseSchedule(Base):
    """
    Admin'in Excel'den yüklediği temel ders programı.
    Bu kayıtlar, ilgili gün/slot/oda için "occupied" sayılır.
    """

    __tablename__ = "base_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_code: Mapped[str] = mapped_column(String(50), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)

    weekday: Mapped[str] = mapped_column(String(2), index=True)  # M, T, W, TH, F
    slot_start: Mapped[int] = mapped_column(Integer, index=True)  # 1..12
    slot_end: Mapped[int] = mapped_column(Integer, index=True)  # inclusive

    raw_text: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped["Room"] = relationship()

    __table_args__ = (
        CheckConstraint("slot_start >= 1", name="ck_bs_slot_start_min"),
        CheckConstraint("slot_end >= slot_start", name="ck_bs_slot_end_ge_start"),
        CheckConstraint("slot_end <= 12", name="ck_bs_slot_end_max"),
        UniqueConstraint("room_id", "weekday", "slot_start", "slot_end", "course_code", name="uq_bs_room_week_slot_course"),
    )


class OtpRequest(Base):
    __tablename__ = "otp_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code: Mapped[str] = mapped_column(String(12))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SessionToken(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(255), default="Sınav")
    requested_capacity: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus), default=ReservationStatus.confirmed, index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="reservations")
    room: Mapped["Room"] = relationship()
    slot: Mapped["Slot"] = relationship()
    course: Mapped["Course"] = relationship()

    __table_args__ = (
        UniqueConstraint("room_id", "slot_id", "day", name="uq_room_slot_day"),
    )


class ReservationLock(Base):
    """
    SQLite satır-kilitleri sınırlı olduğu için pessimistic locking'i bu tabloda
    UNIQUE kısıtı + transaction ile sağlıyoruz.

    Aynı anda aynı (room, slot, day) için lock insert edilemez.
    Lock TTL bittiğinde temizlenebilir.
    """

    __tablename__ = "reservation_locks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    locked_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()
    room: Mapped["Room"] = relationship()
    slot: Mapped["Slot"] = relationship()

    __table_args__ = (
        UniqueConstraint("room_id", "slot_id", "day", name="uq_lock_room_slot_day"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_email: Mapped[str] = mapped_column(String(255), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity: Mapped[str] = mapped_column(String(100), default="")
    entity_id: Mapped[str] = mapped_column(String(100), default="")
    detail: Mapped[str] = mapped_column(String(2000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

