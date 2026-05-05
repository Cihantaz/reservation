import type {
  AvailabilityMatrix,
  Course,
  Reservation,
  Slot,
  SuggestResponse,
  UserMe,
  WeekCalendar
} from "./types";

const configuredApiBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const API_BASE =
  configuredApiBase?.trim() ||
  (typeof window !== "undefined" && window.location.hostname.endsWith("reservation.isikun.edu.tr")
    ? "https://api.reservation.isikun.edu.tr"
    : "http://127.0.0.1:8000");
const API_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessageFromBody(body: unknown): string {
  if (typeof body === "string") {
    if (body.trim().startsWith("<!doctype") || body.trim().startsWith("<html")) {
      return "API beklenmeyen bir yanıt döndürdü. Lütfen API adresini kontrol edin.";
    }
    return body || "Bir hata oluştu.";
  }
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Bir hata oluştu.";
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal
    });
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      throw new ApiError(res.status, errorMessageFromBody(body));
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "API yanıt vermedi. OTP e-posta ayarlarını ve API servis loglarını kontrol edin.");
    }
    throw new ApiError(0, "API'ye ulaşılamadı. Bağlantı, CORS veya API adresi ayarını kontrol edin.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function requestOtp(email: string): Promise<{ message: string }> {
  return http("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function verifyOtp(email: string, code: string): Promise<{ token: string; user: UserMe }> {
  return http("/api/auth/otp/verify", {
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

export async function logout(token: string): Promise<{ message: string }> {
  return http("/api/auth/logout", {
    method: "POST",
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
