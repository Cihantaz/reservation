from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AuditLog, BaseSchedule, Reservation, ReservationLock, ReservationStatus, Room, Slot, User
from .settings import settings
from .utils import utcnow


def cleanup_expired_locks(db: Session) -> None:
    db.execute(delete(ReservationLock).where(ReservationLock.locked_until < utcnow()))


def cleanup_expired_sessions(db: Session) -> None:
    # İleride eklenebilir; şimdilik auth tarafı okurken siliyor.
    return None


def get_availability_matrix(db: Session, day: date) -> tuple[list[Room], list[Slot], dict[tuple[int, int], str]]:
    """
    Dönüş: (rooms, slots, status_map[(room_id, slot_id)] = available|booked|locked)

    NULL/empty handling:
    - Rezervasyon yoksa -> available
    - Lock varsa ve TTL geçmemiş -> locked
    """
    cleanup_expired_locks(db)

    rooms = list(db.scalars(select(Room).order_by(Room.exam_capacity.desc(), Room.name.asc())))
    slots = list(db.scalars(select(Slot).order_by(Slot.sort_order.asc(), Slot.start_time.asc())))

    weekday_map = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F", 5: "F", 6: "F"}  # Sat/Sun yok => F gibi davran (demo)
    wd = weekday_map.get(day.weekday(), "M")

    # booked: reservations confirmed
    booked = set(
        db.execute(
            select(Reservation.room_id, Reservation.slot_id)
            .where(and_(Reservation.day == day, Reservation.status == ReservationStatus.confirmed))
        ).all()
    )

    # base schedule occupied: slot.sort_order (1..12) aralığına göre
    base_rows = db.execute(
        select(BaseSchedule.room_id, BaseSchedule.slot_start, BaseSchedule.slot_end).where(BaseSchedule.weekday == wd)
    ).all()
    base_occupied: set[tuple[int, int]] = set()
    for (room_id, s0, s1) in base_rows:
        for sl in slots:
            slot_num = sl.sort_order
            if s0 <= slot_num <= s1:
                base_occupied.add((room_id, sl.id))

    # locked: active locks
    locked = set(db.execute(select(ReservationLock.room_id, ReservationLock.slot_id).where(ReservationLock.day == day)).all())

    status: dict[tuple[int, int], str] = {}
    for r in rooms:
        for s in slots:
            key = (r.id, s.id)
            if key in booked or key in base_occupied:
                status[key] = "booked"
            elif key in locked:
                status[key] = "locked"
            else:
                status[key] = "available"
    return rooms, slots, status


def week_calendar(db: Session, start_day: date) -> tuple[list[date], list[Slot], dict[tuple[date, int], str]]:
    """
    Slot bazlı haftalık heatmap (tüm odalar üzerinden).
    Bir slot-gün içinde:
      - herhangi bir confirmed rezervasyon varsa -> booked (kırmızı)
      - yok ama herhangi bir lock varsa -> locked (sarı)
      - yoksa -> available (yeşil)
    """
    cleanup_expired_locks(db)

    days = [start_day + timedelta(days=i) for i in range(7)]
    slots = list(db.scalars(select(Slot).order_by(Slot.sort_order.asc())))

    # GROUP BY ile hızlı durum hesaplama
    booked_rows = db.execute(
        select(Reservation.day, Reservation.slot_id, func.count(Reservation.id))
        .where(and_(Reservation.day.in_(days), Reservation.status == ReservationStatus.confirmed))
        .group_by(Reservation.day, Reservation.slot_id)
    ).all()
    booked = {(d, slot_id) for (d, slot_id, _cnt) in booked_rows}

    locked_rows = db.execute(
        select(ReservationLock.day, ReservationLock.slot_id, func.count(ReservationLock.id))
        .where(ReservationLock.day.in_(days))
        .group_by(ReservationLock.day, ReservationLock.slot_id)
    ).all()
    locked = {(d, slot_id) for (d, slot_id, _cnt) in locked_rows}

    status: dict[tuple[date, int], str] = {}
    for d in days:
        for s in slots:
            key = (d, s.id)
            if key in booked:
                status[key] = "booked"
            elif key in locked:
                status[key] = "locked"
            else:
                status[key] = "available"
    return days, slots, status


def available_rooms_for_slots(db: Session, day: date, slot_ids: list[int], room_ids: list[int] | None = None) -> list[Room]:
    """
    JOIN + NULL handling:
    - reservation veya lock olan odaları dışarıda bırakır.
    """
    cleanup_expired_locks(db)

    slot_ids = sorted(set(slot_ids))
    if not slot_ids:
        raise HTTPException(status_code=400, detail="En az 1 slot seçmelisiniz.")

    selected_sort_orders = list(
        db.scalars(select(Slot.sort_order).where(Slot.id.in_(slot_ids)).order_by(Slot.sort_order.asc()))
    )
    if not selected_sort_orders:
        raise HTTPException(status_code=400, detail="Geçerli slot bulunamadı.")

    weekday_map = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F", 5: "F", 6: "F"}
    wd = weekday_map.get(day.weekday(), "M")

    # Slotların herhangi birinde reserved/locked olan room'ları exclude et.
    # SQLite'da NOT EXISTS ile net ve hızlı.
    sub_reserved = (
        select(Reservation.id)
        .where(
            and_(
                Reservation.day == day,
                Reservation.status == ReservationStatus.confirmed,
                Reservation.room_id == Room.id,
                Reservation.slot_id.in_(slot_ids),
            )
        )
        .exists()
    )
    sub_locked = (
        select(ReservationLock.id)
        .where(and_(ReservationLock.day == day, ReservationLock.room_id == Room.id, ReservationLock.slot_id.in_(slot_ids)))
        .exists()
    )
    sub_base_schedule = (
        select(BaseSchedule.id)
        .where(
            and_(
                BaseSchedule.room_id == Room.id,
                BaseSchedule.weekday == wd,
                or_(
                    *[
                        and_(BaseSchedule.slot_start <= slot_order, BaseSchedule.slot_end >= slot_order)
                        for slot_order in selected_sort_orders
                    ]
                ),
            )
        )
        .exists()
    )
    room_filters = [~sub_reserved, ~sub_locked, ~sub_base_schedule]
    if room_ids is not None:
        room_filters.append(Room.id.in_(sorted(set(room_ids))))

    q = select(Room).where(and_(*room_filters)).order_by(Room.exam_capacity.desc(), Room.name.asc())
    return list(db.scalars(q))


def suggest_rooms(
    db: Session,
    day: date,
    slot_ids: list[int],
    required_capacity: int,
    use_exam_capacity: bool,
    room_ids: list[int] | None = None,
) -> tuple[list[Room], int]:
    rooms = available_rooms_for_slots(db, day, slot_ids, room_ids=room_ids)
    cap_attr = "exam_capacity" if use_exam_capacity else "class_capacity"
    cap_label = "sinav kapasitesi" if use_exam_capacity else "sinif kapasitesi"

    candidates = sorted(
        [(room, int(getattr(room, cap_attr) or 0)) for room in rooms],
        key=lambda item: (-item[1], item[0].name),
    )
    if not candidates:
        raise HTTPException(status_code=409, detail="Secilen slotlarda uygun ve bos sinif bulunamadi.")

    single = sorted(
        [candidate for candidate in candidates if candidate[1] >= required_capacity],
        key=lambda item: (item[1] - required_capacity, item[1], item[0].name),
    )
    if single:
        room, cap = single[0]
        return [room], cap

    total_all = sum(cap for (_room, cap) in candidates)
    if total_all < required_capacity:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{required_capacity} kisi icin secilen slotlarda uygun sinif bulunamadi. "
                f"Secili filtrelerde ulasilabilen toplam uygun {cap_label}: {total_all}."
            ),
        )

    chosen: list[tuple[Room, int]] = []
    total = 0
    for candidate in candidates:
        chosen.append(candidate)
        total += candidate[1]
        if total >= required_capacity:
            break

    for room, cap in sorted(chosen, key=lambda item: (item[1], item[0].name)):
        if len(chosen) == 1:
            break
        if total - cap >= required_capacity:
            chosen.remove((room, cap))
            total -= cap

    return [room for (room, _cap) in chosen], total


def acquire_locks(db: Session, user: User, day: date, slot_ids: list[int], room_ids: list[int]):
    cleanup_expired_locks(db)
    if not slot_ids or not room_ids:
        raise HTTPException(status_code=400, detail="Slot ve sınıf seçimi zorunludur.")

    locked_until = utcnow() + timedelta(seconds=settings.lock_ttl_seconds)

    # Transaction içinde insert; UNIQUE conflict -> pessimistic lock başarısız.
    try:
        for room_id in set(room_ids):
            for slot_id in set(slot_ids):
                db.add(
                    ReservationLock(
                        user_id=user.id,
                        room_id=room_id,
                        slot_id=slot_id,
                        day=day,
                        locked_until=locked_until,
                    )
                )
        _log(db, user.email, "reservation.lock", detail=f"day={day} slots={slot_ids} rooms={room_ids}")
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Seçtiğiniz slot/sınıflardan bazıları şu an kilitli veya rezerve edildi.")

    return locked_until


def acquire_locks_cells(db: Session, user: User, day: date, cells: list[tuple[int, int]]):
    cleanup_expired_locks(db)
    if not cells:
        raise HTTPException(status_code=400, detail="En az 1 hücre seçmelisiniz.")

    locked_until = utcnow() + timedelta(seconds=settings.lock_ttl_seconds)
    uniq = sorted(set(cells))

    try:
        for (room_id, slot_id) in uniq:
            db.add(
                ReservationLock(
                    user_id=user.id,
                    room_id=room_id,
                    slot_id=slot_id,
                    day=day,
                    locked_until=locked_until,
                )
            )
        _log(db, user.email, "reservation.lock.cells", detail=f"day={day} cells={uniq}")
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Seçtiğiniz hücrelerden bazıları şu an kilitli veya rezerve edildi.")

    return locked_until


def confirm_reservation_cells(
    db: Session,
    user: User,
    day: date,
    cells: list[tuple[int, int]],
    course_id: int | None,
    purpose: str,
    requested_capacity: int,
) -> list[Reservation]:
    cleanup_expired_locks(db)
    if not cells:
        raise HTTPException(status_code=400, detail="En az 1 hücre seçmelisiniz.")

    uniq = sorted(set(cells))
    room_ids = sorted({r for (r, _s) in uniq})
    slot_ids = sorted({s for (_r, s) in uniq})

    # Kullanıcının lock'ları var mı? (tam hücre seti)
    locks = list(
        db.scalars(
            select(ReservationLock).where(
                and_(
                    ReservationLock.user_id == user.id,
                    ReservationLock.day == day,
                    ReservationLock.room_id.in_(room_ids),
                    ReservationLock.slot_id.in_(slot_ids),
                )
            )
        )
    )
    locked_pairs = {(l.room_id, l.slot_id) for l in locks}
    if any(pair not in locked_pairs for pair in uniq):
        raise HTTPException(status_code=409, detail="Rezervasyon onayı için gerekli kilitler bulunamadı (süresi dolmuş olabilir).")

    created: list[Reservation] = []
    try:
        for (room_id, slot_id) in uniq:
            res = Reservation(
                user_id=user.id,
                room_id=room_id,
                slot_id=slot_id,
                day=day,
                course_id=course_id,
                purpose=purpose,
                requested_capacity=requested_capacity,
                status=ReservationStatus.confirmed,
            )
            db.add(res)
            created.append(res)

        db.execute(
            delete(ReservationLock).where(
                and_(
                    ReservationLock.user_id == user.id,
                    ReservationLock.day == day,
                    ReservationLock.room_id.in_(room_ids),
                    ReservationLock.slot_id.in_(slot_ids),
                )
            )
        )
        _log(db, user.email, "reservation.confirm.cells", detail=f"day={day} cells={uniq}")
        db.flush()
        return created
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Rezervasyon çakışması oluştu (birisi aynı anda rezerve etti).")


def confirm_reservation(
    db: Session,
    user: User,
    day: date,
    slot_ids: list[int],
    room_ids: list[int],
    course_id: int | None,
    purpose: str,
    requested_capacity: int,
) -> list[Reservation]:
    cleanup_expired_locks(db)

    room_ids = sorted(set(room_ids))
    slot_ids = sorted(set(slot_ids))
    if not room_ids or not slot_ids:
        raise HTTPException(status_code=400, detail="Slot ve sınıf seçimi zorunludur.")

    # Kullanıcının lock'ları var mı?
    locks = list(
        db.scalars(
            select(ReservationLock).where(
                and_(
                    ReservationLock.user_id == user.id,
                    ReservationLock.day == day,
                    ReservationLock.room_id.in_(room_ids),
                    ReservationLock.slot_id.in_(slot_ids),
                )
            )
        )
    )
    expected = len(room_ids) * len(slot_ids)
    if len(locks) != expected:
        raise HTTPException(status_code=409, detail="Rezervasyon onayı için gerekli kilitler bulunamadı (süresi dolmuş olabilir).")

    created: list[Reservation] = []
    try:
        for room_id in room_ids:
            for slot_id in slot_ids:
                res = Reservation(
                    user_id=user.id,
                    room_id=room_id,
                    slot_id=slot_id,
                    day=day,
                    course_id=course_id,
                    purpose=purpose,
                    requested_capacity=requested_capacity,
                    status=ReservationStatus.confirmed,
                )
                db.add(res)
                created.append(res)
        # lock'ları sil
        db.execute(
            delete(ReservationLock).where(
                and_(
                    ReservationLock.user_id == user.id,
                    ReservationLock.day == day,
                    ReservationLock.room_id.in_(room_ids),
                    ReservationLock.slot_id.in_(slot_ids),
                )
            )
        )
        _log(db, user.email, "reservation.confirm", detail=f"day={day} slots={slot_ids} rooms={room_ids}")
        db.flush()
        return created
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Rezervasyon çakışması oluştu (birisi aynı anda rezerve etti).")


def cancel_reservation(db: Session, user: User, reservation_id: int) -> None:
    res = db.get(Reservation, reservation_id)
    if not res or res.status != ReservationStatus.confirmed:
        raise HTTPException(status_code=404, detail="Rezervasyon bulunamadı.")
    if res.user_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Sadece kendi rezervasyonunuzu iptal edebilirsiniz.")

    res.status = ReservationStatus.cancelled
    res.cancelled_at = utcnow()
    _log(db, user.email, "reservation.cancel", entity="reservation", entity_id=str(reservation_id))


def _log(db: Session, actor: str, action: str, entity: str = "", entity_id: str = "", detail: str = "") -> None:
    db.add(AuditLog(actor_email=actor, action=action, entity=entity, entity_id=entity_id, detail=detail))

