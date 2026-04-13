from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from . import services
from .auth import bootstrap_login, get_current_user, request_otp, require_admin, test_login, verify_otp
from .db import Base, engine, get_db
from .models import AuditLog, BaseSchedule, Course, Reservation, Room, Slot, User
from .schedule_import import parse_rooms_excel, parse_schedule_excel, parse_schedule_csv
from .schemas import (
    AvailabilityMatrixOut,
    AuditLogOut,
    ConfirmIn,
    ConfirmCellsIn,
    CourseOut,
    CourseUpsertIn,
    GlobalReservationOut,
    HealthResponse,
    LockIn,
    LockCellsIn,
    LockOut,
    MapRangeIn,
    MapRangeOut,
    MyReservationsOut,
    PagedAuditLogsOut,
    PagedGlobalReservationsOut,
    ReservationOut,
    RoomOut,
    RoomUpsertIn,
    SessionOut,
    SlotOut,
    SlotUpsertIn,
    SuggestIn,
    SuggestOut,
    UserMe,
    UploadSchedulePreviewOut,
    UploadScheduleSaveIn,
    WeekCalendarOut,
)
from .seed import seed_if_empty
from .settings import settings
from .utils import intervals_overlap


app = FastAPI(title="Classroom & Exam Reservation API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    Base.metadata.create_all(bind=engine)
    from .db import SessionLocal

    with SessionLocal() as db:
        seed_if_empty(db)
        db.commit()


@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "message": "Classroom & Exam Reservation API çalışıyor.",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/api/matrix", response_model=AvailabilityMatrixOut)
def get_matrix(
    date_str: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the classroom matrix for a given date.
    
    Query params:
      - date_str: YYYY-MM-DD format (default: today)
    
    Returns all rooms, slots, and their availability status:
      - available: can be reserved
      - booked: has base schedule or existing reservation
      - locked: admin locked
    """
    # Parse date
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = datetime.now().date()
    
    # Calculate weekday: M, T, W, TH, F, SA, SU
    weekday_map = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F", 5: "SA", 6: "SU"}
    target_weekday = weekday_map[target_date.weekday()]
    
    # Load all rooms
    rooms = db.scalars(select(Room)).all()
    room_dicts = [
        {
            "id": r.id,
            "name": r.name,
            "building": r.building,
            "class_capacity": r.class_capacity,
            "exam_capacity": r.exam_capacity,
        }
        for r in rooms
    ]
    
    # Load all slots (1-12)
    slot_times = [
        ("08:30", "09:20"),
        ("09:30", "10:20"),
        ("10:30", "11:20"),
        ("11:30", "12:20"),
        ("12:30", "13:20"),
        ("13:30", "14:20"),
        ("14:30", "15:20"),
        ("15:30", "16:20"),
        ("16:30", "17:20"),
        ("17:30", "18:20"),
        ("18:30", "19:20"),
        ("19:30", "20:20"),
    ]
    slots = []
    for slot_num in range(1, 13):
        start_time, end_time = slot_times[slot_num - 1]
        slots.append({
            "id": slot_num,
            "code": str(slot_num),
            "start_time": start_time,
            "end_time": end_time,
            "sort_order": slot_num,
        })
    
    # Load base schedule for target weekday
    base_schedule = db.scalars(
        select(BaseSchedule).where(BaseSchedule.weekday == target_weekday)
    ).all()
    
    # Load reservations for target date
    reservations = db.scalars(
        select(Reservation).where(Reservation.day == target_date)
    ).all()
    
    # Build cells: room_id x slot_id → status
    cells = []
    booked_cells = set()  # (room_id, slot_id)
    
    # Mark BaseSchedule bookings
    for bs in base_schedule:
        for slot_num in range(bs.slot_start, bs.slot_end + 1):
            booked_cells.add((bs.room_id, slot_num))
    
    # Mark Reservation bookings
    for res in reservations:
        if res.status in ("confirmed", "tentative"):
            booked_cells.add((res.room_id, res.slot_id))
    
    # Generate all cells
    for room in rooms:
        for slot_num in range(1, 13):
            if (room.id, slot_num) in booked_cells:
                status = "booked"
            else:
                status = "available"
            
            cells.append({
                "room_id": room.id,
                "slot_id": slot_num,
                "status": status,
            })
    
    return {
        "day": target_date,
        "rooms": room_dicts,
        "slots": slots,
        "cells": cells,
    }


# ----------------------
# Auth
# ----------------------


@app.post("/api/auth/request-otp")
def auth_request_otp(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email", "")
    request_otp(db, email=email)
    db.commit()
    return {"message": "OTP gönderildi (geliştirme ortamında terminalde görebilirsiniz)."}


@app.post("/api/auth/verify-otp", response_model=SessionOut)
def auth_verify_otp(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email", "")
    code = payload.get("code", "")
    sess = verify_otp(db, email=email, code=code)
    user = db.get(User, sess.user_id)
    db.commit()
    return {"token": sess.token, "user": {"email": user.email, "role": user.role}}


@app.post("/api/auth/bootstrap-login", response_model=SessionOut)
def auth_bootstrap_login(payload: dict, db: Session = Depends(get_db)):
    secret = payload.get("key", "")
    sess = bootstrap_login(db, secret=secret)
    user = db.get(User, sess.user_id)
    db.commit()
    return {"token": sess.token, "user": {"email": user.email, "role": user.role}}


@app.post("/api/auth/test-login", response_model=SessionOut)
def auth_test_login(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email", "")
    password = payload.get("password", "")
    sess = test_login(db, email=email, password=password)
    user = db.get(User, sess.user_id)
    db.commit()
    return {"token": sess.token, "user": {"email": user.email, "role": user.role}}


@app.get("/api/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)):
    return {"email": user.email, "role": user.role}


# ----------------------
# Admin (core data)
# ----------------------


@app.get("/admin/rooms", response_model=list[RoomOut])
def admin_rooms(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    rooms = list(db.scalars(select(Room).order_by(Room.name.asc())))
    return rooms


@app.get("/api/admin/global-reservations", response_model=PagedGlobalReservationsOut)
def admin_global_reservations(
    q: str | None = None,
    day: date | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    limit = max(1, min(200, limit))
    offset = max(0, offset)

    stmt = (
        select(Reservation)
        .options(joinedload(Reservation.room), joinedload(Reservation.slot), joinedload(Reservation.course), joinedload(Reservation.user))
    )
    if day:
        stmt = stmt.where(Reservation.day == day)
    if status:
        stmt = stmt.where(Reservation.status == status)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Reservation.purpose).like(like)
            | func.lower(Room.name).like(like)
            | func.lower(User.email).like(like)
        )

    # join'lar q filtresi için
    stmt = stmt.join(Reservation.room).join(Reservation.user)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(
        db.scalars(
            stmt.order_by(Reservation.day.desc(), Reservation.slot_id.asc(), Reservation.room_id.asc())
            .limit(limit)
            .offset(offset)
        )
    )
    db.add(AuditLog(actor_email=admin.email, action="admin.global_reservations.view", detail=f"limit={limit} offset={offset}"))
    db.commit()
    out = []
    for r in items:
        out.append(
            {
                "id": r.id,
                "day": r.day,
                "status": r.status,
                "room": r.room,
                "slot": r.slot,
                "purpose": r.purpose,
                "requested_capacity": r.requested_capacity,
                "course": r.course,
                "created_at": r.created_at,
                "actor_email": r.user.email,
            }
        )
    return {"total": total, "items": out}


@app.get("/api/admin/audit-logs", response_model=PagedAuditLogsOut)
def admin_audit_logs(
    actor_email: str | None = None,
    action: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    limit = max(1, min(200, limit))
    offset = max(0, offset)

    stmt = select(AuditLog)
    if actor_email:
        stmt = stmt.where(AuditLog.actor_email == actor_email.strip().lower())
    if action:
        stmt = stmt.where(AuditLog.action == action.strip())

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)))
    return {
        "total": total,
        "items": [
            {
                "id": a.id,
                "actor_email": a.actor_email,
                "action": a.action,
                "entity": a.entity,
                "entity_id": a.entity_id,
                "detail": a.detail,
                "created_at": a.created_at,
            }
            for a in items
        ],
    }


@app.get("/admin/courses", response_model=list[CourseOut])
def admin_courses(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    courses = list(db.scalars(select(Course).order_by(Course.code.asc())))
    return courses


@app.get("/admin/slots", response_model=list[SlotOut])
def admin_slots(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    slots = list(db.scalars(select(Slot).order_by(Slot.sort_order.asc())))
    return slots


@app.post("/admin/rooms", response_model=RoomOut)
def admin_create_room(payload: RoomUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    room_code = f"{payload.building}-{payload.room_number}"
    room = Room(
        name=room_code,
        building=payload.building,
        room_number=payload.room_number,
        feature=payload.feature,
        class_capacity=payload.class_capacity,
        exam_capacity=payload.exam_capacity,
    )
    db.add(room)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu isimde bir sınıf zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.room.create", entity="room", entity_id=str(room.id)))
    db.commit()
    return room


@app.put("/admin/rooms/{room_id}", response_model=RoomOut)
def admin_update_room(room_id: int, payload: RoomUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Sınıf bulunamadı.")
    room.name = f"{payload.building}-{payload.room_number}"
    room.building = payload.building
    room.room_number = payload.room_number
    room.feature = payload.feature
    room.class_capacity = payload.class_capacity
    room.exam_capacity = payload.exam_capacity
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu isimde bir sınıf zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.room.update", entity="room", entity_id=str(room.id)))
    db.commit()
    return room


@app.delete("/admin/rooms/{room_id}")
def admin_delete_room(room_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Sınıf bulunamadı.")
    db.delete(room)
    db.add(AuditLog(actor_email=admin.email, action="admin.room.delete", entity="room", entity_id=str(room_id)))
    db.commit()
    return {"message": "Sınıf silindi."}


@app.post("/admin/courses", response_model=CourseOut)
def admin_create_course(payload: CourseUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    course = Course(code=payload.code, name=payload.name)
    db.add(course)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu ders kodu zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.course.create", entity="course", entity_id=str(course.id)))
    db.commit()
    return course


@app.put("/admin/courses/{course_id}", response_model=CourseOut)
def admin_update_course(course_id: int, payload: CourseUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı.")
    course.code = payload.code
    course.name = payload.name
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu ders kodu zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.course.update", entity="course", entity_id=str(course.id)))
    db.commit()
    return course


@app.delete("/admin/courses/{course_id}")
def admin_delete_course(course_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı.")
    db.delete(course)
    db.add(AuditLog(actor_email=admin.email, action="admin.course.delete", entity="course", entity_id=str(course_id)))
    db.commit()
    return {"message": "Ders silindi."}


@app.post("/admin/slots", response_model=SlotOut)
def admin_create_slot(payload: SlotUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="Slot başlangıcı bitişten önce olmalı.")
    slot = Slot(code=payload.code, start_time=payload.start_time, end_time=payload.end_time, sort_order=payload.sort_order)
    db.add(slot)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu slot kodu zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.slot.create", entity="slot", entity_id=str(slot.id)))
    db.commit()
    return slot


@app.put("/admin/slots/{slot_id}", response_model=SlotOut)
def admin_update_slot(slot_id: int, payload: SlotUpsertIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="Slot başlangıcı bitişten önce olmalı.")
    slot = db.get(Slot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot bulunamadı.")
    slot.code = payload.code
    slot.start_time = payload.start_time
    slot.end_time = payload.end_time
    slot.sort_order = payload.sort_order
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu slot kodu zaten var.")
    db.add(AuditLog(actor_email=admin.email, action="admin.slot.update", entity="slot", entity_id=str(slot.id)))
    db.commit()
    return slot


@app.delete("/admin/slots/{slot_id}")
def admin_delete_slot(slot_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    slot = db.get(Slot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot bulunamadı.")
    db.delete(slot)
    db.add(AuditLog(actor_email=admin.email, action="admin.slot.delete", entity="slot", entity_id=str(slot_id)))
    db.commit()
    return {"message": "Slot silindi."}


# ----------------------
# Admin: Bulk Delete (Tümünü Sil)
# ----------------------

@app.delete("/admin/delete-all-rooms")
def admin_delete_all_rooms(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all rooms"""
    count = db.query(Room).delete()
    db.add(AuditLog(actor_email=admin.email, action="admin.rooms.delete-all", detail=f"deleted={count}"))
    db.commit()
    return {"message": f"{count} sınıf silindi."}


@app.delete("/admin/delete-all-courses")
def admin_delete_all_courses(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all courses"""
    count = db.query(Course).delete()
    db.add(AuditLog(actor_email=admin.email, action="admin.courses.delete-all", detail=f"deleted={count}"))
    db.commit()
    return {"message": f"{count} ders silindi."}


@app.delete("/admin/delete-all-slots")
def admin_delete_all_slots(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all slots"""
    count = db.query(Slot).delete()
    db.add(AuditLog(actor_email=admin.email, action="admin.slots.delete-all", detail=f"deleted={count}"))
    db.commit()
    return {"message": f"{count} slot silindi."}


@app.delete("/admin/delete-all-base-schedules")
def admin_delete_all_base_schedules(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all base schedules (ders programı)"""
    count = db.query(BaseSchedule).delete()
    db.add(AuditLog(actor_email=admin.email, action="admin.base-schedules.delete-all", detail=f"deleted={count}"))
    db.commit()
    return {"message": f"{count} ders programı kaydı silindi."}


@app.delete("/admin/delete-all-reservations")
def admin_delete_all_reservations(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all reservations"""
    count = db.query(Reservation).delete()
    db.add(AuditLog(actor_email=admin.email, action="admin.reservations.delete-all", detail=f"deleted={count}"))
    db.commit()
    return {"message": f"{count} rezervasyon silindi."}


@app.delete("/admin/delete-all-audit-logs")
def admin_delete_all_audit_logs(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete all audit logs"""
    count = db.query(AuditLog).delete()
    db.commit()
    return {"message": f"{count} audit log kaydı silindi."}


# ----------------------
# Public data (authed)
# ----------------------


@app.get("/rooms", response_model=list[RoomOut])
def rooms(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return list(db.scalars(select(Room).order_by(Room.name.asc())))


# ----------------------
# Admin: Base Schedule (Excel)
# ----------------------


@app.post("/api/admin/upload-schedule-preview", response_model=UploadSchedulePreviewOut)
async def admin_upload_schedule_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    print(f"[UPLOAD] Dosya yükleme başlandı: {file.filename}")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="Dosya adı eksik.")
    
    filename_lower = file.filename.lower()
    print(f"[UPLOAD] Dosya türü: {filename_lower}")
    
    # File type check
    if not (filename_lower.endswith((".xlsx", ".xls", ".csv", ".tsv", ".txt"))):
        raise HTTPException(status_code=400, detail="Lütfen .xlsx, .csv, .tsv, .txt veya Excel dosyası yükleyin.")
    
    try:
        content = await file.read()
        print(f"[UPLOAD] Dosya okundu, boyut: {len(content)} bytes")
        
        # DB'deki Oda listesi ve Ders kodlarını önceden yükle
        rooms = db.scalars(select(Room)).all()
        room_names_dict = {r.name: r.id for r in rooms}
        
        courses = db.scalars(select(Course)).all()
        course_codes_dict = {c.code: c.id for c in courses}
        
        print(f"[UPLOAD] DB'de {len(room_names_dict)} oda, {len(course_codes_dict)} ders kodu var")
        
        # Parse based on file type
        if filename_lower.endswith((".xlsx", ".xls")):
            print(f"[UPLOAD] Excel dosyası parse ediliyor (fuzzy matching aktif)...")
            preview = parse_schedule_excel(content, available_rooms=room_names_dict)
        else:  # CSV, TSV, TXT
            print(f"[UPLOAD] CSV dosyası parse ediliyor...")
            preview = parse_schedule_csv(content, available_rooms=room_names_dict)
        
        print(f"[UPLOAD] Parse tamamlandı. Hatalar: {len(preview['errors'])}, Satırlar: {preview['total_items']}")

        # Validation 1: Oda adı doğrulaması
        # - Schedule'da kullanılan sınıflar Rooms DB'sinde olmalı
        # - Yoksa o satır sessizce atlanır ve rapor edilir
        valid_items = []
        mismatch_items = []  # Eşleşmeyen sınıflar
        
        for it in preview["items"]:
            room_name = it["room_name"]
            
            # Exact match or already matched by fuzzy
            if room_name in room_names_dict:
                valid_items.append(it)
            else:
                # Mevcut olmayan sınıfı rapor et
                mismatch_items.append({
                    "course_code": it["course_code"],
                    "room_name": it["room_name"],
                    "weekday": it["weekday"],
                    "slot": it["slot"],
                    "source_row": it.get("source_row", "?"),
                    "reason": "Sınıf veritabanında bulunamadı"
                })
        
        # Mismatches'ı errors'a EKLEME! Ayrı tutuyoruz - hatalar panel'de gösterilecek
        # Preview response kısmında errors yerine warnings array'i eklenecek
        
        # Validation 2: Ders Kodu doğrulaması  
        # - Schedule'da kullanılan ders kodları varsa DB'ye ekle, yoksa update et
        missing_courses = {
            it["course_code"]
            for it in valid_items
            if it["course_code"] not in course_codes_dict
        }
        warnings = [
            {
                "row": None,
                "message": f"Ders kodu '{course_code}' kaydetme sÄ±rasÄ±nda otomatik oluÅŸturulacak."
            }
            for course_code in sorted(missing_courses)
        ]

        warnings = [
            {
                "row": None,
                "message": f"Ders kodu '{course_code}' kaydetme sirasinda otomatik olusturulacak."
            }
            for course_code in sorted(missing_courses)
        ]

        preview["items"] = valid_items
        preview["total_items"] = len(valid_items)
        preview["warnings"] = warnings
        preview["mismatches"] = mismatch_items
        preview["ok"] = len(valid_items) > 0 and len(preview["errors"]) == 0

        print(
            f"[UPLOAD] Validation: {len(valid_items)} valid, "
            f"{len(mismatch_items)} mismatches, {len(missing_courses)} missing courses"
        )

        db.add(
            AuditLog(
                actor_email=admin.email,
                action="admin.schedule.preview",
                detail=(
                    f"file={file.filename} valid={len(valid_items)} "
                    f"mismatches={len(mismatch_items)} missing_courses={len(missing_courses)}"
                ),
            )
        )
        db.commit()
        print("[UPLOAD] Yanit gonderiliyor...")
        return preview
        
        # Eksik dersleri otomatik oluştur
        for course_code in missing_courses:
            try:
                print(f"[UPLOAD] Ders kodu '{course_code}' otomatik oluşturuluyor...")
                new_course = Course(code=course_code, name=course_code)
                db.add(new_course)
                db.flush()
                course_codes_dict[course_code] = new_course.id
                preview["errors"].append({
                    "row": None,
                    "message": f"ℹ️  Ders kodu '{course_code}' otomatik oluşturuldu"
                })
            except Exception as e:
                print(f"[UPLOAD] HATA: Ders '{course_code}' oluşturamazı: {str(e)}")
                preview["errors"].append({
                    "row": None,
                    "message": f"❌ Ders '{course_code}' oluşturamazı: {str(e)}"
                })
        
        # Update items (skip invalid rooms)
        preview["items"] = valid_items
        preview["total_items"] = len(valid_items)
        preview["mismatches"] = mismatch_items  # RAPOR et
        
        # Mark as error only if:
        # - Valid items YOK (boş yükleme)
        # - Veya kritik hata var (❌ ile başlayan)
        # Mismatches HATA DEĞİL - sadece rapor olarak gösterilir!
        preview["ok"] = len(valid_items) > 0 and all(
            "❌" not in e.get("message", "") for e in preview["errors"]
        )
        
        print(f"[UPLOAD] Validation: {len(valid_items)} valid, {len(mismatch_items)} mismatches, {len(missing_courses)} courses auto-created")
        
        db.add(AuditLog(
            actor_email=admin.email, 
            action="admin.schedule.preview", 
            detail=f"file={file.filename} valid={len(valid_items)} mismatches={len(mismatch_items)} auto_courses={len(missing_courses)}"
        ))
        db.commit()
        
        print(f"[UPLOAD] Yanıt gönderiliyor...")
        return preview
    
    except Exception as e:
        print(f"[UPLOAD] HATA: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload hatası: {str(e)}")


@app.post("/api/admin/upload-schedule-save")
def admin_upload_schedule_save(
    payload: UploadScheduleSaveIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    print(f"[SAVE] Endpoint çağrıldı")
    print(f"[SAVE] Admin: {admin.email}")
    
    items = payload.items or []
    print(f"[SAVE] Items sayısı: {len(items)}")
    
    if not items:
        print(f"[SAVE] HATA: Items boş!")
        raise HTTPException(status_code=400, detail="Kaydedilecek veri bulunamadı.")

    room_by_name = {r.name: r.id for r in db.scalars(select(Room)).all()}
    print(f"[SAVE] DB'de {len(room_by_name)} sınıf var")
    
    course_by_code = {c.code: c for c in db.scalars(select(Course)).all()}
    existing_rows_by_key: dict[tuple[int, str, int, int], list[BaseSchedule]] = {}
    for row in db.scalars(select(BaseSchedule)).all():
        key = (row.room_id, row.weekday, row.slot_start, row.slot_end)
        existing_rows_by_key.setdefault(key, []).append(row)

    created = 0
    updated = 0
    skipped = 0
    missing_rooms = 0
    created_courses = 0

    try:
        for item in items:
            course_code = str(item.get("course_code", "")).strip()
            room_name = str(item.get("room_name", "")).strip()
            weekday = str(item.get("weekday", "")).strip().upper()
            slot = int(item.get("slot", 0) or 0)
            raw_text = str(item.get("raw_text") or "")

            print(f"[SAVE] Satir: {course_code} - {room_name} - {weekday}{slot}")

            if not course_code or not room_name or not weekday or not slot:
                skipped += 1
                continue

            room_id = room_by_name.get(room_name)
            if not room_id:
                missing_rooms += 1
                continue

            if course_code not in course_by_code:
                course = Course(code=course_code, name=course_code)
                db.add(course)
                course_by_code[course_code] = course
                created_courses += 1

            key = (room_id, weekday, slot, slot)
            rows_for_key = existing_rows_by_key.setdefault(key, [])
            same_course_row = next((row for row in rows_for_key if row.course_code == course_code), None)
            if same_course_row:
                if (same_course_row.raw_text or "") != raw_text:
                    same_course_row.raw_text = raw_text
                    updated += 1
                else:
                    skipped += 1
                continue

            if rows_for_key:
                rows_for_key[0].course_code = course_code
                rows_for_key[0].raw_text = raw_text
                updated += 1
                continue

            new_row = BaseSchedule(
                course_code=course_code,
                room_id=room_id,
                weekday=weekday,
                slot_start=slot,
                slot_end=slot,
                raw_text=raw_text,
            )
            db.add(new_row)
            rows_for_key.append(new_row)
            created += 1

        db.add(
            AuditLog(
                actor_email=admin.email,
                action="admin.schedule.save",
                detail=(
                    f"created={created} updated={updated} skipped={skipped} "
                    f"missing_rooms={missing_rooms} created_courses={created_courses}"
                ),
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ders programi kaydedilirken cakisma olustu. Gerekirse mevcut programi temizleyip tekrar deneyin.",
        )

    print("[SAVE] Veritabani guncellendi")
    return {
        "message": (
            f"Ders programi islendi. Eklenen: {created}, Guncellenen: {updated}, "
            f"Degismeyen: {skipped}, Yeni dersler: {created_courses}"
        )
    }

    created = 0
    for it in items:
        course_code = str(it.get("course_code", "")).strip()
        room_name = str(it.get("room_name", "")).strip()
        weekday = str(it.get("weekday", "")).strip().upper()
        slot = int(it.get("slot", 0) or 0)
        
        print(f"[SAVE] Satır: {course_code} - {room_name} - {weekday}{slot}")
        
        if not course_code or not room_name or not weekday or not slot:
            print(f"[SAVE] ⚠️  Satır atlandı (eksik alan)")
            continue
        
        room_id = room_by_name.get(room_name)
        if not room_id:
            print(f"[SAVE] ⚠️  Sınıf {room_name} DB'de yok - atlandı")
            continue
        print(f"[SAVE] ✓ Sınıf {room_name} bulundu (ID: {room_id})")
        db.add(
            BaseSchedule(
                course_code=course_code,
                room_id=room_id,
                weekday=weekday,
                slot_start=slot,
                slot_end=slot,
                raw_text=str(it.get("raw_text") or ""),
            )
        )
        created += 1

    print(f"[SAVE] Toplam {created} satır eklendi")
    db.add(AuditLog(actor_email=admin.email, action="admin.schedule.save", detail=f"created={created}"))
    db.commit()
    print(f"[SAVE] ✓ Veritabanına kaydedildi!")
    return {"message": f"Ders programı kaydedildi: {created} satır eklendi"}


@app.post("/api/admin/upload-rooms-preview")
async def admin_upload_rooms_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Lütfen .xlsx uzantılı bir Excel dosyası yükleyin.")
    content = await file.read()
    preview = parse_rooms_excel(content)
    db.add(AuditLog(actor_email=admin.email, action="admin.rooms.preview", detail=f"file={file.filename} items={preview['total_items']}"))
    db.commit()
    return preview


@app.post("/api/admin/upload-rooms-save")
def admin_upload_rooms_save(
    payload: UploadScheduleSaveIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    items = payload.items or []
    if not items:
        raise HTTPException(status_code=400, detail="Kaydedilecek veri bulunamadı.")

    created = 0
    updated = 0
    for it in items:
        room_code = str(it.get("room_code", "")).strip()
        building = str(it.get("building", "")).strip()
        room_number = str(it.get("room_number", "")).strip()
        feature = str(it.get("feature", "")).strip()
        cap = int(it.get("class_capacity", 0) or 0)
        exam_cap = int(it.get("exam_capacity", cap // 2) or 0)
        if not room_code or not building or not room_number:
            continue

        room = db.scalar(select(Room).where(Room.name == room_code))
        if room:
            room.building = building
            room.room_number = room_number
            room.feature = feature
            room.class_capacity = cap
            room.exam_capacity = exam_cap
            updated += 1
        else:
            db.add(
                Room(
                    name=room_code,
                    building=building,
                    room_number=room_number,
                    feature=feature,
                    class_capacity=cap,
                    exam_capacity=exam_cap,
                )
            )
            created += 1

    db.add(AuditLog(actor_email=admin.email, action="admin.rooms.save", detail=f"created={created} updated={updated}"))
    db.commit()
    return {"message": f"Sınıflar içe aktarıldı. Eklenen: {created}, Güncellenen: {updated}"}


@app.get("/courses", response_model=list[CourseOut])
def courses(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return list(db.scalars(select(Course).order_by(Course.code.asc())))


@app.get("/slots", response_model=list[SlotOut])
def slots(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return list(db.scalars(select(Slot).order_by(Slot.sort_order.asc())))


@app.post("/slots/map-range", response_model=MapRangeOut)
def map_range(payload: MapRangeIn, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    if payload.start_time >= payload.end_time:
        return {"slot_ids": [], "slot_codes": []}
    slots = list(db.scalars(select(Slot).order_by(Slot.sort_order.asc())))
    picked = [s for s in slots if intervals_overlap(payload.start_time, payload.end_time, s.start_time, s.end_time)]
    return {"slot_ids": [s.id for s in picked], "slot_codes": [s.code for s in picked]}


@app.get("/availability", response_model=AvailabilityMatrixOut)
def availability(day: date, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    rooms, slots, status = services.get_availability_matrix(db, day=day)
    cells = [{"room_id": rid, "slot_id": sid, "status": st} for ((rid, sid), st) in status.items()]
    return {"day": day, "rooms": rooms, "slots": slots, "cells": cells}


@app.get("/calendar/week", response_model=WeekCalendarOut)
def calendar_week(start_day: date, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    days, slots, status = services.week_calendar(db, start_day=start_day)
    cells = [{"day": d, "slot_id": sid, "status": st} for ((d, sid), st) in status.items()]
    return {"start_day": start_day, "days": days, "slots": slots, "cells": cells}


# ----------------------
# Reservation flow
# ----------------------


@app.post("/reservations/suggest", response_model=SuggestOut)
def reservations_suggest(payload: SuggestIn, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    rooms, total = services.suggest_rooms(
        db,
        day=payload.day,
        slot_ids=payload.slot_ids,
        required_capacity=payload.required_capacity,
        use_exam_capacity=payload.use_exam_capacity,
    )
    cap_attr = "exam_capacity" if payload.use_exam_capacity else "class_capacity"
    return {
        "required_capacity": payload.required_capacity,
        "total_capacity": total,
        "rooms": [{"id": r.id, "name": r.name, "capacity": getattr(r, cap_attr)} for r in rooms],
    }


@app.post("/reservations/lock", response_model=LockOut)
def reservations_lock(payload: LockIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    locked_until = services.acquire_locks(db, user=user, day=payload.day, slot_ids=payload.slot_ids, room_ids=payload.room_ids)
    db.commit()
    return {"locked_until": locked_until}


@app.post("/reservations/lock-cells", response_model=LockOut)
def reservations_lock_cells(payload: LockCellsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cells = [(c.room_id, c.slot_id) for c in payload.cells]
    locked_until = services.acquire_locks_cells(db, user=user, day=payload.day, cells=cells)
    db.commit()
    return {"locked_until": locked_until}


@app.post("/reservations/confirm", response_model=list[ReservationOut])
def reservations_confirm(payload: ConfirmIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    created = services.confirm_reservation(
        db,
        user=user,
        day=payload.day,
        slot_ids=payload.slot_ids,
        room_ids=payload.room_ids,
        course_id=payload.course_id,
        purpose=payload.purpose,
        requested_capacity=payload.requested_capacity,
    )
    db.commit()

    # joinedload ile tek seferde UI verisi
    ids = [r.id for r in created]
    items = list(
        db.scalars(
            select(Reservation)
            .options(joinedload(Reservation.room), joinedload(Reservation.slot), joinedload(Reservation.course))
            .where(Reservation.id.in_(ids))
        )
    )
    return [_reservation_out(r) for r in items]


@app.post("/reservations/confirm-cells", response_model=list[ReservationOut])
def reservations_confirm_cells(payload: ConfirmCellsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cells = [(c.room_id, c.slot_id) for c in payload.cells]
    created = services.confirm_reservation_cells(
        db,
        user=user,
        day=payload.day,
        cells=cells,
        course_id=payload.course_id,
        purpose=payload.purpose,
        requested_capacity=payload.requested_capacity,
    )
    db.commit()

    ids = [r.id for r in created]
    items = list(
        db.scalars(
            select(Reservation)
            .options(joinedload(Reservation.room), joinedload(Reservation.slot), joinedload(Reservation.course))
            .where(Reservation.id.in_(ids))
        )
    )
    return [_reservation_out(r) for r in items]


@app.get("/reservations/my", response_model=MyReservationsOut)
def reservations_my(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = list(
        db.scalars(
            select(Reservation)
            .options(joinedload(Reservation.room), joinedload(Reservation.slot), joinedload(Reservation.course))
            .where(Reservation.user_id == user.id)
            .order_by(Reservation.day.desc(), Reservation.slot_id.asc())
        )
    )
    return {"items": [_reservation_out(r) for r in items]}


@app.post("/reservations/{reservation_id}/cancel")
def reservations_cancel(reservation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    services.cancel_reservation(db, user=user, reservation_id=reservation_id)
    db.commit()
    return {"message": "Rezervasyon iptal edildi."}


def _reservation_out(r: Reservation) -> dict:
    return {
        "id": r.id,
        "day": r.day,
        "status": r.status,
        "room": r.room,
        "slot": r.slot,
        "purpose": r.purpose,
        "requested_capacity": r.requested_capacity,
        "course": r.course,
        "created_at": r.created_at,
    }

