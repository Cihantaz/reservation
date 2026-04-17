import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Plus, Trash2, UploadCloud } from "lucide-react";
import { ApiError } from "../../api";
import type { Course, Room, Slot } from "../../types";
import { Badge, Button, Card, Input, Select } from "../../ui";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:3001";

async function http<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`
      }
    });
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = typeof body === "string" ? body : body?.detail ?? "Bir hata oluştu.";
      throw new ApiError(res.status, msg);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

function formatCourseLabel(course: Course): string {
  const code = course.code.trim();
  const name = course.name.trim();
  return !name || name.toLowerCase() === code.toLowerCase() ? code : `${code} - ${name}`;
}

function normalizedExamCapacity(building: string, fallback: number): number {
  return building.trim().toUpperCase() === "DK" ? 25 : fallback;
}

export default function AdminPanel(props: { token: string }) {
  const [tab, setTab] = useState<
    "program" | "siniflar" | "dersler" | "slotlar" | "rezervasyonlar" | "loglar" | "rapor"
  >("program");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Excel upload (Ders Programı)
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<null | {
    ok: boolean;
    total_items: number;
    items: { course_code: string; room_name: string; weekday: string; slot: number; source_row?: number }[];
    errors: { row?: number | null; message: string; detail?: string }[];
    warnings: { row?: number | null; message: string }[];
    mismatches?: { course_code: string; room_name: string; weekday: string; slot: number; source_row: number | string; reason: string }[];
  }>(null);

  // Rooms: Excel upload
  const roomsFileRef = useRef<HTMLInputElement | null>(null);
  const [roomsUploading, setRoomsUploading] = useState(false);
  const [roomsPreview, setRoomsPreview] = useState<null | {
    ok: boolean;
    total_items: number;
    items: { room_code: string; building: string; room_number: string; feature: string; class_capacity: number; exam_capacity: number; source_row?: number }[];
    errors: { row?: number | null; message: string; detail?: string }[];
  }>(null);

  // Room form (manuel ekle/düzenle)
  const [roomIdEditing, setRoomIdEditing] = useState<number | null>(null);
  const [roomBuilding, setRoomBuilding] = useState("DMF");
  const [roomNumber, setRoomNumber] = useState("114");
  const [roomFeature, setRoomFeature] = useState("Projeksiyon");
  const [roomClassCap, setRoomClassCap] = useState("40");
  const [roomExamCap, setRoomExamCap] = useState("20");

  // Course form
  const [courseCode, setCourseCode] = useState("NEW101");
  const [courseName, setCourseName] = useState("Yeni Ders");

  // Slot form
  const [slotCode, setSlotCode] = useState("M6");
  const [slotStart, setSlotStart] = useState("14:30");
  const [slotEnd, setSlotEnd] = useState("15:20");
  const [slotOrder, setSlotOrder] = useState("6");

  // Global reservations
  const [globalQ, setGlobalQ] = useState("");
  const [globalDay, setGlobalDay] = useState("");
  const [globalStatus, setGlobalStatus] = useState("");
  const [globalOffset, setGlobalOffset] = useState(0);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalItems, setGlobalItems] = useState<any[]>([]);

  // Audit logs
  const [logActor, setLogActor] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logOffset, setLogOffset] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [logItems, setLogItems] = useState<any[]>([]);

  async function loadAll() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const [r, c, s] = await Promise.all([
        http<Room[]>("/admin/rooms", props.token).then((x: any) => x.value ?? x),
        http<Course[]>("/admin/courses", props.token).then((x: any) => x.value ?? x),
        http<Slot[]>("/admin/slots", props.token).then((x: any) => x.value ?? x)
      ]);
      setRooms(r);
      setCourses(c);
      setSlots(s);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadGlobalReservations() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (globalQ.trim()) params.set("q", globalQ.trim());
      if (globalDay) params.set("day", globalDay);
      if (globalStatus) params.set("status", globalStatus);
      params.set("limit", "50");
      params.set("offset", String(globalOffset));
      const res = await http<any>(`/api/admin/global-reservations?${params.toString()}`, props.token);
      setGlobalTotal(res.total ?? 0);
      setGlobalItems(res.items ?? []);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (logActor.trim()) params.set("actor_email", logActor.trim().toLowerCase());
      if (logAction.trim()) params.set("action", logAction.trim());
      params.set("limit", "50");
      params.set("offset", String(logOffset));
      const res = await http<any>(`/api/admin/audit-logs?${params.toString()}`, props.token);
      setLogTotal(res.total ?? 0);
      setLogItems(res.items ?? []);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  const slotPayload = useMemo(() => {
    // backend Time: "HH:MM:SS"
    const s = slotStart.length === 5 ? `${slotStart}:00` : slotStart;
    const e = slotEnd.length === 5 ? `${slotEnd}:00` : slotEnd;
    return { code: slotCode, start_time: s, end_time: e, sort_order: Number(slotOrder) || 0 };
  }, [slotCode, slotEnd, slotOrder, slotStart]);

  async function uploadPreview(file: File) {
    setError("");
    setMessage("");
    setPreview(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await http<any>("/api/admin/upload-schedule-preview", props.token, {
        method: "POST",
        body: form
      });
      setPreview({
        ...res,
        warnings: res.warnings ?? [],
        mismatches: res.mismatches ?? []
      });
      if (!res.ok) setMessage("Önizleme tamamlandı: Hatalar var, lütfen düzeltin.");
      else setMessage("Önizleme tamamlandı: Kaydetmeye hazır.");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmSave() {
    if (!preview?.items?.length) {
      setError("Kaydedilecek veri bulunamadı.");
      return;
    }
    if (!preview.ok) {
      setError("Hatalar varken kaydetme yapılamaz. Lütfen Excel’i düzeltin.");
      return;
    }
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const res = await http<any>("/api/admin/upload-schedule-save", props.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: preview.items })
      });
      setMessage(res?.message ?? "Kaydedildi.");
      setPreview(null);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadRoomsPreview(file: File) {
    setError("");
    setMessage("");
    setRoomsPreview(null);
    setRoomsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await http<any>("/api/admin/upload-rooms-preview", props.token, { method: "POST", body: form });
      setRoomsPreview(res);
      if (!res.ok) setMessage("Sınıf önizlemesi tamamlandı: Hatalar var, lütfen düzeltin.");
      else setMessage("Sınıflar önizlendi: UPSERT için hazır.");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setRoomsUploading(false);
    }
  }

  async function confirmRoomsSave() {
    if (!roomsPreview?.items?.length) {
      setError("Kaydedilecek sınıf verisi bulunamadı.");
      return;
    }
    if (roomsPreview.errors?.length) {
      setError("Hatalar varken kaydetme yapılamaz. Lütfen Excel’i düzeltin.");
      return;
    }
    setError("");
    setMessage("");
    setRoomsUploading(true);
    try {
      const res = await http<any>("/api/admin/upload-rooms-save", props.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: roomsPreview.items })
      });
      setMessage(res?.message ?? "Sınıflar kaydedildi.");
      setRoomsPreview(null);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setRoomsUploading(false);
    }
  }

  async function createRoom() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const payload = {
        building: roomBuilding,
        room_number: roomNumber,
        feature: roomFeature,
        class_capacity: Number(roomClassCap) || 0,
        exam_capacity: normalizedExamCapacity(roomBuilding, Number(roomExamCap) || 0)
      };

      if (roomIdEditing) {
        await http(`/admin/rooms/${roomIdEditing}`, props.token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        setMessage("Sınıf güncellendi.");
      } else {
        await http("/admin/rooms", props.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
        setMessage("Sınıf eklendi.");
      }
      setRoomIdEditing(null);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom(id: number) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await http(`/admin/rooms/${id}`, props.token, { method: "DELETE" });
      setMessage("Sınıf silindi.");
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function createCourse() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await http("/admin/courses", props.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: courseCode, name: courseName })
      });
      setMessage("Ders eklendi.");
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCourse(id: number) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await http(`/admin/courses/${id}`, props.token, { method: "DELETE" });
      setMessage("Ders silindi.");
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function createSlot() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await http("/admin/slots", props.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotPayload)
      });
      setMessage("Slot eklendi.");
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(id: number) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await http(`/admin/slots/${id}`, props.token, { method: "DELETE" });
      setMessage("Slot silindi.");
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  // Bulk Delete Functions
  async function deleteAllBaseSchedules() {
    if (!window.confirm("⚠️  Tüm ders programı kayıtlarını sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-base-schedules", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllRooms() {
    if (!window.confirm("⚠️  Tüm sınıfları sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-rooms", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllCourses() {
    if (!window.confirm("⚠️  Tüm dersleri sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-courses", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllSlots() {
    if (!window.confirm("⚠️  Tüm slotları sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-slots", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllReservations() {
    if (!window.confirm("⚠️  Tüm rezervasyonları sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-reservations", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllAuditLogs() {
    if (!window.confirm("⚠️  Tüm audit log kayıtlarını sileceksiniz. Emin misiniz?")) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await http<any>("/admin/delete-all-audit-logs", props.token, { method: "DELETE" });
      setMessage(res.message);
      await loadAll();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "program" ? "primary" : "secondary"} onClick={() => setTab("program")}>
          Ders Programı
        </Button>
        <Button variant={tab === "siniflar" ? "primary" : "secondary"} onClick={() => setTab("siniflar")}>
          Sınıflar
        </Button>
        <Button variant={tab === "dersler" ? "primary" : "secondary"} onClick={() => setTab("dersler")}>
          Dersler
        </Button>
        <Button variant={tab === "slotlar" ? "primary" : "secondary"} onClick={() => setTab("slotlar")}>
          Slotlar
        </Button>
        <Button
          variant={tab === "rezervasyonlar" ? "primary" : "secondary"}
          onClick={() => {
            setTab("rezervasyonlar");
            setGlobalOffset(0);
            loadGlobalReservations().catch(() => void 0);
          }}
        >
          Global Rezervasyonlar
        </Button>
        <Button
          variant={tab === "loglar" ? "primary" : "secondary"}
          onClick={() => {
            setTab("loglar");
            setLogOffset(0);
            loadAuditLogs().catch(() => void 0);
          }}
        >
          Audit Logları
        </Button>
        <Button
          variant={tab === "rapor" ? "primary" : "secondary"}
          onClick={() => setTab("rapor")}
        >
          📋 Rapor (Eşleşme Hataları)
        </Button>
      </div>

      {tab === "program" ? (
      <Card className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200 ring-1 ring-white/10">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Ders Programı Yükle (Excel)</div>
              <div className="text-xs text-white/55">Önce önizleme (dry-run), sonra onaylayıp DB’ye kaydedin.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPreview(f);
              }}
            />
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="whitespace-nowrap"
            >
              <UploadCloud className="h-4 w-4" />
              Excel Seç
            </Button>
            <Button onClick={confirmSave} disabled={uploading || !preview?.ok} className="whitespace-nowrap">
              Onayla ve Veritabanına Kaydet
            </Button>
            <Button
              onClick={deleteAllBaseSchedules}
              disabled={uploading || loading}
              className="whitespace-nowrap bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
            >
              🗑️ Tümünü Sil
            </Button>
          </div>
        </div>

        <div
          className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 px-6 py-8 text-center"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) uploadPreview(f);
          }}
        >
          <div className="text-sm font-semibold">Dosyayı buraya sürükleyip bırakın</div>
          <div className="mt-1 text-xs text-white/55">Beklenen kolonlar: Ders Kodu | Sınıf(lar) | Ders Saati</div>
          <div className="mt-2 text-xs text-white/45">Örn: AHİZ1121.1 | A203, A204 | T4, T5 (ZIP eşleştirme)</div>
        </div>

        {uploading ? <div className="mt-4 text-sm text-white/60">İşleniyor…</div> : null}

        {preview ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Önizleme</div>
                <div className="flex gap-2">
                  <Badge tone={preview.ok ? "green" : "yellow"}>{preview.ok ? "Hatasız" : "Hatalı"}</Badge>
                  <Badge tone="slate">Toplam Satır: {preview.total_items}</Badge>
                </div>
              </div>

              <div className="mt-3 grid max-h-96 overflow-y-auto rounded-xl border border-white/10">
                <div className="min-w-[700px]">
                  <div className="sticky top-0 grid grid-cols-4 gap-2 bg-slate-950/80 px-2 py-2 text-xs font-semibold text-white/60">
                    <div>Ders Kodu</div>
                    <div>Sınıf</div>
                    <div>Gün</div>
                    <div>Slot</div>
                  </div>
                  <div className="h-px bg-white/10" />
                  {preview.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 border-b border-white/5 px-2 py-2 text-xs text-white/80 hover:bg-white/5">
                      <div className="font-semibold">{it.course_code}</div>
                      <div>{it.room_name}</div>
                      <div>{it.weekday}</div>
                      <div>{it.slot}</div>
                    </div>
                  ))}
                  {preview.items.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-white/50">Hiç kayıt yok</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold">Hatalar</div>
              <div className="mt-2 text-xs text-white/55">Hata varsa kaydetme kapalıdır.</div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {preview.errors.length === 0 ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Hata yok.</div>
                ) : (
                  preview.errors.map((er, i) => (
                    <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                      <div>
                        <span className="font-semibold">{er.row ? `Satır ${er.row}` : "Genel"}:</span> {er.message}
                      </div>
                      {er.detail ? <div className="mt-1 text-[11px] text-rose-100/80">{er.detail}</div> : null}
                    </div>
                  ))
                )}
                {preview.errors.length > 0 ? (
                  <div className="text-xs text-white/50">Toplam hata: {preview.errors.length}</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
      ) : null}

      {tab === "siniflar" ? (
        <Card className="p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Sınıf Yönetimi</div>
            <div className="text-xs text-white/55">Manuel ekle/düzenle veya Excel ile toplu içe aktar (UPSERT).</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="slate">Sınıf: {rooms.length}</Badge>
            <Button variant="secondary" onClick={loadAll} disabled={loading}>
              Yenile
            </Button>
            <Button
              onClick={deleteAllRooms}
              disabled={loading}
              className="bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
            >
              🗑️ Tümünü Sil
            </Button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>
        ) : null}
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : null}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold">{roomIdEditing ? "Sınıf Düzenle" : "Sınıf Ekle"}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-white/60">Bina</div>
                  <Input value={roomBuilding} onChange={setRoomBuilding} placeholder="DMF / A / B" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/60">Derslik Numarası</div>
                  <Input value={roomNumber} onChange={setRoomNumber} placeholder="114" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold text-white/60">Özellik</div>
                  <Input value={roomFeature} onChange={setRoomFeature} placeholder="Projeksiyon, Bilgisayar Lab..." />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/60">Kapasite</div>
                  <Input value={roomClassCap} onChange={setRoomClassCap} type="number" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/60">Sınav Kapasitesi</div>
                  <Input
                    value={roomBuilding.trim().toUpperCase() === "DK" ? "25" : roomExamCap}
                    onChange={setRoomExamCap}
                    type="number"
                    disabled={roomBuilding.trim().toUpperCase() === "DK"}
                  />
                  {roomBuilding.trim().toUpperCase() === "DK" ? (
                    <div className="mt-1 text-[11px] text-white/50">DK dersliklerinde sınav kapasitesi sabit 25 uygulanır.</div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={createRoom} disabled={loading}>
                  <Plus className="h-4 w-4" />
                  {roomIdEditing ? "Güncelle" : "Ekle"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRoomIdEditing(null);
                    setRoomBuilding("DMF");
                    setRoomNumber("");
                    setRoomFeature("");
                    setRoomClassCap("40");
                    setRoomExamCap("20");
                  }}
                >
                  Formu Temizle
                </Button>
              </div>
              <div className="mt-3 text-xs text-white/50">
                Oda kodu otomatik oluşur: <span className="font-semibold">{roomBuilding}-{roomNumber || "___"}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold">Sınıfları Excel ile Toplu İçe Aktar</div>
              <div className="mt-1 text-xs text-white/55">Kolonlar: Bina | Derslik Numarası | Özellik | Kapasite</div>

              <input
                ref={roomsFileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadRoomsPreview(f);
                }}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => roomsFileRef.current?.click()} disabled={roomsUploading}>
                  <UploadCloud className="h-4 w-4" />
                  Excel Seç
                </Button>
                <Button onClick={confirmRoomsSave} disabled={roomsUploading || !roomsPreview?.ok}>
                  Onayla ve UPSERT Uygula
                </Button>
              </div>

              <div
                className="mt-4 rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-6 py-8 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) uploadRoomsPreview(f);
                }}
              >
                <div className="text-sm font-semibold">Dosyayı buraya sürükleyip bırakın</div>
                <div className="mt-1 text-xs text-white/55">room_code = Bina-DerslikNo (örn: DMF-114)</div>
                <div className="mt-1 text-xs text-white/45">Sınav Kapasitesi otomatik: genel sınıflarda floor(Kapasite/2), DK dersliklerinde sabit 25</div>
              </div>

              {roomsUploading ? <div className="mt-4 text-sm text-white/60">İşleniyor…</div> : null}

              {roomsPreview ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={roomsPreview.ok ? "green" : "yellow"}>{roomsPreview.ok ? "Hatasız" : "Hatalı"}</Badge>
                    <Badge tone="slate">Toplam: {roomsPreview.total_items}</Badge>
                  </div>
                  <div className="grid max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/30">
                    <div className="min-w-[650px]">
                      <div className="sticky top-0 grid grid-cols-4 gap-2 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white/60">
                        <div>Oda Kodu</div>
                        <div>Özellik</div>
                        <div>Kapasite</div>
                        <div>Sınav Kap.</div>
                      </div>
                      <div className="h-px bg-white/10" />
                      {roomsPreview.items.map((it, i) => (
                        <div key={i} className="grid grid-cols-4 gap-2 border-b border-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/5">
                          <div className="font-semibold">{it.room_code}</div>
                          <div className="truncate">{it.feature || "-"}</div>
                          <div>{it.class_capacity}</div>
                          <div>{it.exam_capacity}</div>
                        </div>
                      ))}
                      {roomsPreview.items.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-white/50">Hiç sınıf yok</div>
                      ) : null}
                    </div>
                  </div>

                  {roomsPreview.errors.length ? (
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                      {roomsPreview.errors.map((er, i) => (
                        <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                          <div>
                            <span className="font-semibold">{er.row ? `Satır ${er.row}` : "Genel"}:</span> {er.message}
                          </div>
                          {er.detail ? <div className="mt-1 text-[11px] text-rose-100/80">{er.detail}</div> : null}
                        </div>
                      ))}
                      <div className="text-xs text-white/50">Toplam hata: {roomsPreview.errors.length}</div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Hata yok.</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold">Mevcut Sınıflar ({rooms.length})</div>
            <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto md:grid-cols-2">
              {rooms.map((r) => (
                <div key={r.id} className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/8">
                  <div className="text-xs text-white/80">
                    <div className="font-semibold">{r.name}</div>
                    <div className="mt-1 text-white/55">Özellik: {r.feature || "-"}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge tone="slate">Kapasite: {r.class_capacity}</Badge>
                      <Badge tone="slate">Sınav Kap.: {r.exam_capacity}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRoomIdEditing(r.id);
                        setRoomBuilding(r.building);
                        setRoomNumber(r.room_number);
                        setRoomFeature(r.feature);
                        setRoomClassCap(String(r.class_capacity));
                        setRoomExamCap(String(r.exam_capacity));
                      }}
                    >
                      Düzenle
                    </Button>
                    <button className="text-rose-200/80 hover:text-rose-200" onClick={() => deleteRoom(r.id)} disabled={loading}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {rooms.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-xs text-white/50">Henüz sınıf eklenmedi</div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "dersler" ? (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Ders Yönetimi</div>
            <Button
              onClick={deleteAllCourses}
              disabled={loading}
              className="bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
            >
              🗑️ Tümünü Sil
            </Button>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Input value={courseCode} onChange={setCourseCode} placeholder="Örn: CSE101" />
              <Input value={courseName} onChange={setCourseName} placeholder="Ders adı" />
              <Button onClick={createCourse} disabled={loading}>
                <Plus className="h-4 w-4" />
                Ekle
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-white/55">Toplam ders: {courses.length}</div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-xs text-white/80">
                    <span className="font-semibold">{formatCourseLabel(c)}</span>
                  </div>
                  <button className="text-rose-200/80 hover:text-rose-200" onClick={() => deleteCourse(c.id)} disabled={loading}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {courses.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-xs text-white/55">
                  Henüz ders kaydı yok.
                </div>
              ) : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "slotlar" ? (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Slot Yönetimi</div>
            <Button
              onClick={deleteAllSlots}
              disabled={loading}
              className="bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
            >
              🗑️ Tümünü Sil
            </Button>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input value={slotCode} onChange={setSlotCode} placeholder="Örn: M6" />
                <Input value={slotOrder} onChange={setSlotOrder} type="number" placeholder="Sıra" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={slotStart} onChange={setSlotStart} type="time" />
                <Input value={slotEnd} onChange={setSlotEnd} type="time" />
              </div>
              <Button onClick={createSlot} disabled={loading}>
                <Plus className="h-4 w-4" />
                Ekle
              </Button>
            </div>
            <div className="space-y-2">
              {slots.slice(0, 16).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-xs text-white/80">
                    <span className="font-semibold">{s.code}</span> <span className="text-white/45">{s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}</span>
                  </div>
                  <button className="text-rose-200/80 hover:text-rose-200" onClick={() => deleteSlot(s.id)} disabled={loading}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "rezervasyonlar" ? (
        <Card className="p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Global Rezervasyon Görünümü</div>
              <div className="text-xs text-white/55">Tüm kullanıcıların rezervasyonlarını görüntüleyin ve filtreleyin.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">Toplam: {globalTotal}</Badge>
              <Button
                onClick={deleteAllReservations}
                disabled={loading}
                className="bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
              >
                🗑️ Tümünü Sil
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Arama</div>
              <Input value={globalQ} onChange={setGlobalQ} placeholder="E-posta / sınıf / amaç" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Tarih</div>
              <Input value={globalDay} onChange={setGlobalDay} type="date" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Durum</div>
              <Select value={globalStatus} onChange={setGlobalStatus}>
                <option value="">Tümü</option>
                <option value="confirmed">Onaylı</option>
                <option value="cancelled">İptal</option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setGlobalOffset(0);
                  loadGlobalReservations().catch(() => void 0);
                }}
                disabled={loading}
              >
                Filtrele
              </Button>
              <Button variant="secondary" onClick={loadGlobalReservations} disabled={loading}>
                Yenile
              </Button>
            </div>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border border-white/10 bg-slate-950/30">
            <div className="min-w-[1050px]">
              <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs font-semibold text-white/60">
                <div>Kullanıcı</div>
                <div>Tarih</div>
                <div>Slot</div>
                <div>Sınıf</div>
                <div>Amaç</div>
                <div>Kapasite</div>
                <div>Durum</div>
              </div>
              <div className="h-px bg-white/10" />
              {globalItems.map((r, i) => (
                <div key={i} className="grid grid-cols-7 gap-2 px-3 py-2 text-xs text-white/80">
                  <div className="truncate font-semibold">{r.actor_email}</div>
                  <div>{r.day}</div>
                  <div>{r.slot?.code}</div>
                  <div className="font-semibold">{r.room?.name}</div>
                  <div className="truncate">{r.purpose}</div>
                  <div>{r.requested_capacity}</div>
                  <div>
                    <Badge tone={r.status === "confirmed" ? "green" : "slate"}>{r.status === "confirmed" ? "Onaylı" : "İptal"}</Badge>
                  </div>
                </div>
              ))}
              {globalItems.length === 0 ? <div className="px-3 py-4 text-sm text-white/60">Kayıt yok.</div> : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-white/50">Sayfa: {Math.floor(globalOffset / 50) + 1}</div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={loading || globalOffset === 0}
                onClick={() => {
                  setGlobalOffset((o) => Math.max(0, o - 50));
                  setTimeout(() => loadGlobalReservations().catch(() => void 0), 0);
                }}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                disabled={loading || globalOffset + 50 >= globalTotal}
                onClick={() => {
                  setGlobalOffset((o) => o + 50);
                  setTimeout(() => loadGlobalReservations().catch(() => void 0), 0);
                }}
              >
                Sonraki
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "loglar" ? (
        <Card className="p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Audit Logları</div>
              <div className="text-xs text-white/55">Sistemde yapılan işlemlerin iz kaydı.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">Toplam: {logTotal}</Badge>
              <Button
                onClick={deleteAllAuditLogs}
                disabled={loading}
                className="bg-rose-600/20 text-rose-100 hover:bg-rose-600/30"
              >
                🗑️ Tümünü Sil
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Kullanıcı E-posta</div>
              <Input value={logActor} onChange={setLogActor} placeholder="cihan.tazeoz@isikun.edu.tr" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Aksiyon</div>
              <Input value={logAction} onChange={setLogAction} placeholder="reservation.confirm.cells" />
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setLogOffset(0);
                  loadAuditLogs().catch(() => void 0);
                }}
                disabled={loading}
              >
                Filtrele
              </Button>
              <Button variant="secondary" onClick={loadAuditLogs} disabled={loading}>
                Yenile
              </Button>
            </div>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border border-white/10 bg-slate-950/30">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs font-semibold text-white/60">
                <div>Tarih/Saat</div>
                <div>Kullanıcı</div>
                <div>Aksiyon</div>
                <div>Entity</div>
                <div>ID</div>
                <div>Detay</div>
              </div>
              <div className="h-px bg-white/10" />
              {logItems.map((a, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 px-3 py-2 text-xs text-white/80">
                  <div className="text-white/65">{new Date(a.created_at).toLocaleString("tr-TR")}</div>
                  <div className="truncate font-semibold">{a.actor_email}</div>
                  <div className="truncate">{a.action}</div>
                  <div>{a.entity || "-"}</div>
                  <div className="truncate">{a.entity_id || "-"}</div>
                  <div className="truncate text-white/65">{a.detail || "-"}</div>
                </div>
              ))}
              {logItems.length === 0 ? <div className="px-3 py-4 text-sm text-white/60">Kayıt yok.</div> : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-white/50">Sayfa: {Math.floor(logOffset / 50) + 1}</div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={loading || logOffset === 0}
                onClick={() => {
                  setLogOffset((o) => Math.max(0, o - 50));
                  setTimeout(() => loadAuditLogs().catch(() => void 0), 0);
                }}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                disabled={loading || logOffset + 50 >= logTotal}
                onClick={() => {
                  setLogOffset((o) => o + 50);
                  setTimeout(() => loadAuditLogs().catch(() => void 0), 0);
                }}
              >
                Sonraki
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "rapor" ? (
        <Card className="p-6">
          <div>
            <div className="text-sm font-semibold">📋 Eşleşme Raporı</div>
            <div className="text-xs text-white/55">Excel yüklenmesi sırasında eşleştirilemeyen sınıflar ve dersler.</div>
          </div>

          {preview?.mismatches && preview.mismatches.length > 0 ? (
            <div className="mt-4 space-y-4">
              <div className="text-xs text-white/60">
                {preview.mismatches.length} kayıt bulunamadı
              </div>
              <div className="grid max-h-96 overflow-y-auto rounded-xl border border-white/10">
                <div className="sticky top-0 grid grid-cols-5 gap-2 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white/60">
                  <div>Ders Kodu</div>
                  <div>Sınıf</div>
                  <div>Gün/Saat</div>
                  <div>Excel Satırı</div>
                  <div>Sebep</div>
                </div>
                {preview.mismatches.map((m, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-white/80 border-t border-white/5">
                    <div className="font-semibold">{m.course_code}</div>
                    <div className="text-orange-300">{m.room_name}</div>
                    <div>{m.weekday}{m.slot}</div>
                    <div className="text-white/60">{m.source_row}</div>
                    <div className="text-red-300">{m.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2 text-sm text-green-300">
              ✅ Eşleşme sorunu yok! Tüm veriler başarıyla eşleştirildi.
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

