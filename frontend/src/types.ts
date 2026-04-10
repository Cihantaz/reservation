export type UserRole = "admin" | "user";

export type UserMe = {
  email: string;
  role: UserRole;
};

export type Room = {
  id: number;
  name: string;
  building: string;
  room_number: string;
  feature: string;
  class_capacity: number;
  exam_capacity: number;
};

export type Slot = {
  id: number;
  code: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  sort_order: number;
};

export type AvailabilityCell = {
  room_id: number;
  slot_id: number;
  status: "available" | "booked" | "locked";
};

export type AvailabilityMatrix = {
  day: string;
  rooms: Room[];
  slots: Slot[];
  cells: AvailabilityCell[];
};

export type WeekDayCell = {
  day: string;
  slot_id: number;
  status: "available" | "booked" | "locked";
};

export type WeekCalendar = {
  start_day: string;
  days: string[];
  slots: Slot[];
  cells: WeekDayCell[];
};

export type Course = {
  id: number;
  code: string;
  name: string;
};

export type SuggestedRoom = {
  id: number;
  name: string;
  capacity: number;
};

export type SuggestResponse = {
  required_capacity: number;
  total_capacity: number;
  rooms: SuggestedRoom[];
};

export type Reservation = {
  id: number;
  day: string;
  status: "confirmed" | "cancelled";
  room: Room;
  slot: Slot;
  purpose: string;
  requested_capacity: number;
  course: Course | null;
  created_at: string;
};

