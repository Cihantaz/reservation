from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field

from .models import ReservationStatus, UserRole


class HealthResponse(BaseModel):
    status: str


class UserMe(BaseModel):
    email: EmailStr
    role: UserRole


class OtpRequestIn(BaseModel):
    email: EmailStr


class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class SessionOut(BaseModel):
    token: str
    user: UserMe


class RoomOut(BaseModel):
    id: int
    name: str
    building: str
    room_number: str
    feature: str
    class_capacity: int
    exam_capacity: int


class RoomUpsertIn(BaseModel):
    building: str = Field(min_length=1, max_length=20, default="A")
    room_number: str = Field(min_length=1, max_length=20)
    feature: str = Field(max_length=255, default="")
    class_capacity: int = Field(ge=0, le=1000)
    exam_capacity: int = Field(ge=0, le=1000)


class SlotOut(BaseModel):
    id: int
    code: str
    start_time: time
    end_time: time
    sort_order: int


class SlotUpsertIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    start_time: time
    end_time: time
    sort_order: int = Field(ge=0, le=1000)


class CourseOut(BaseModel):
    id: int
    code: str
    name: str


class CourseUpsertIn(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=255)


class MapRangeIn(BaseModel):
    start_time: time
    end_time: time


class MapRangeOut(BaseModel):
    slot_ids: list[int]
    slot_codes: list[str]


class AvailabilityCell(BaseModel):
    room_id: int
    slot_id: int
    status: str  # available | booked | locked


class AvailabilityMatrixOut(BaseModel):
    day: date
    rooms: list[RoomOut]
    slots: list[SlotOut]
    cells: list[AvailabilityCell]


class SuggestIn(BaseModel):
    day: date
    slot_ids: list[int]
    required_capacity: int = Field(ge=1)
    use_exam_capacity: bool = True
    course_id: int | None = None
    purpose: str = "Sınav"


class SuggestedRoom(BaseModel):
    id: int
    name: str
    capacity: int


class SuggestOut(BaseModel):
    required_capacity: int
    total_capacity: int
    rooms: list[SuggestedRoom]


class LockIn(BaseModel):
    day: date
    slot_ids: list[int]
    room_ids: list[int]


class LockOut(BaseModel):
    locked_until: datetime


class CellId(BaseModel):
    room_id: int
    slot_id: int


class LockCellsIn(BaseModel):
    day: date
    cells: list[CellId]


class ConfirmIn(BaseModel):
    day: date
    slot_ids: list[int]
    room_ids: list[int]
    course_id: int | None = None
    purpose: str = "Sınav"
    requested_capacity: int = 0


class ConfirmCellsIn(BaseModel):
    day: date
    cells: list[CellId]
    course_id: int | None = None
    purpose: str = "Sınav"
    requested_capacity: int = 0


class UploadSchedulePreviewOut(BaseModel):
    ok: bool
    total_items: int
    items: list[dict]
    errors: list[dict]
    warnings: list[dict] = Field(default_factory=list)
    mismatches: list[dict] = Field(default_factory=list)


class UploadScheduleSaveIn(BaseModel):
    items: list[dict]


class ReservationOut(BaseModel):
    id: int
    day: date
    status: ReservationStatus
    room: RoomOut
    slot: SlotOut
    purpose: str
    requested_capacity: int
    course: CourseOut | None
    created_at: datetime


class MyReservationsOut(BaseModel):
    items: list[ReservationOut]


class GlobalReservationOut(ReservationOut):
    actor_email: str


class WeekDayCell(BaseModel):
    day: date
    slot_id: int
    status: str  # available | booked | locked


class WeekCalendarOut(BaseModel):
    start_day: date
    days: list[date]
    slots: list[SlotOut]
    cells: list[WeekDayCell]


class AuditLogOut(BaseModel):
    id: int
    actor_email: str
    action: str
    entity: str
    entity_id: str
    detail: str
    created_at: datetime


class PagedAuditLogsOut(BaseModel):
    total: int
    items: list[AuditLogOut]


class PagedGlobalReservationsOut(BaseModel):
    total: int
    items: list[GlobalReservationOut]

