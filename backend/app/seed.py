from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Room, SessionToken, Slot, User, UserRole
from .schedule_import import derive_exam_capacity
from .settings import settings


DEV_TOKEN = "test-dev-token-123456789"


DEFAULT_SLOTS = [
    ("1", "08:30", "09:20", 1),
    ("2", "09:30", "10:20", 2),
    ("3", "10:30", "11:20", 3),
    ("4", "11:30", "12:20", 4),
    ("5", "12:30", "13:20", 5),
    ("6", "13:30", "14:20", 6),
    ("7", "14:30", "15:20", 7),
    ("8", "15:30", "16:20", 8),
    ("9", "16:30", "17:20", 9),
    ("10", "17:30", "18:20", 10),
    ("11", "18:30", "19:20", 11),
    ("12", "19:30", "20:20", 12),
]


def seed_if_empty(db: Session) -> None:
    """
    Initialize the admin user, dev token, and default slots.

    Rooms, courses, and base schedules are loaded via Excel uploads:
    - "Derslik Listesi" (Rooms Excel) -> Rooms table
    - "Ders Programi" (Schedule Excel) -> BaseSchedule table
    - Slots default to 1..12 so the matrix can render immediately
    """

    admin = db.scalar(select(User).where(User.email == "cihan.tazeoz@isikun.edu.tr"))
    if not admin:
        admin = User(email="cihan.tazeoz@isikun.edu.tr", role=UserRole.admin, is_active=True)
        db.add(admin)
        db.flush()
        print("[SEED] Admin user created: cihan.tazeoz@isikun.edu.tr")

    dev_session = db.scalar(select(SessionToken).where(SessionToken.token == DEV_TOKEN))
    if settings.enable_dev_token:
        if not dev_session:
            expires_at = datetime.now(timezone.utc) + timedelta(days=365)
            db.add(SessionToken(token=DEV_TOKEN, user_id=admin.id, expires_at=expires_at))
            print(f"[SEED] Dev Token: {DEV_TOKEN}")
    elif dev_session:
        db.delete(dev_session)
        print("[SEED] Existing dev token removed because RESERVATION_ENABLE_DEV_TOKEN is disabled")

    if not db.scalar(select(Slot.id).limit(1)):
        for code, start_raw, end_raw, order in DEFAULT_SLOTS:
            db.add(
                Slot(
                    code=code,
                    start_time=time.fromisoformat(start_raw),
                    end_time=time.fromisoformat(end_raw),
                    sort_order=order,
                )
            )
        print(f"[SEED] {len(DEFAULT_SLOTS)} default slots created")

    normalized_rooms = 0
    for room in db.scalars(select(Room)).all():
        expected_exam_capacity = derive_exam_capacity(room.building, room.class_capacity)
        if room.exam_capacity != expected_exam_capacity:
            room.exam_capacity = expected_exam_capacity
            normalized_rooms += 1

    if normalized_rooms:
        print(f"[SEED] {normalized_rooms} room exam capacities normalized")

    db.commit()
