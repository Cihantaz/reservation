import type {
  AvailabilityMatrix,
  Course,
  Reservation,
  Slot,
  SuggestResponse,
  UserMe,
  WeekCalendar
} from "./types";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:3001";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === "string" ? body : body?.detail ?? "Bir hata oluştu.";
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export async function requestOtp(email: string): Promise<{ message: string }> {
  return http("/api/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function verifyOtp(email: string, code: string): Promise<{ token: string; user: UserMe }> {
  return http("/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code })
  });
}

export async function me(token: string): Promise<UserMe> {
  return http("/api/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function slots(token: string): Promise<Slot[]> {
  return http("/slots", { headers: { Authorization: `Bearer ${token}` } }).then((x: any) => x.value ?? x);
}

export async function courses(token: string): Promise<Course[]> {
  return http("/courses", { headers: { Authorization: `Bearer ${token}` } }).then((x: any) => x.value ?? x);
}

export async function availability(token: string, day: string): Promise<AvailabilityMatrix> {
  return http(`/availability?day=${encodeURIComponent(day)}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function weekCalendar(token: string, startDay: string): Promise<WeekCalendar> {
  return http(`/calendar/week?start_day=${encodeURIComponent(startDay)}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function suggest(token: string, payload: any): Promise<SuggestResponse> {
  return http("/reservations/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function lock(token: string, payload: any): Promise<{ locked_until: string }> {
  return http("/reservations/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function lockCells(
  token: string,
  payload: { day: string; cells: { room_id: number; slot_id: number }[] }
): Promise<{ locked_until: string }> {
  return http("/reservations/lock-cells", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function confirm(token: string, payload: any): Promise<Reservation[]> {
  return http("/reservations/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  }).then((x: any) => x.value ?? x);
}

export async function confirmCells(
  token: string,
  payload: {
    day: string;
    cells: { room_id: number; slot_id: number }[];
    purpose: string;
    requested_capacity: number;
    course_id: number | null;
  }
): Promise<Reservation[]> {
  return http("/reservations/confirm-cells", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  }).then((x: any) => x.value ?? x);
}

export async function myReservations(token: string): Promise<Reservation[]> {
  const out = await http<{ items: Reservation[] }>("/reservations/my", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return out.items;
}

export async function cancelReservation(token: string, id: number): Promise<{ message: string }> {
  return http(`/reservations/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}
