import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Sparkles } from "lucide-react";
import {
  ApiError,
  availability as apiAvailability,
  confirmCells as apiConfirmCells,
  courses as apiCourses,
  lockCells as apiLockCells,
  slots as apiSlots,
  suggest as apiSuggest
} from "../api";
import type { AvailabilityMatrix, Course, Slot, SuggestResponse } from "../types";
import { Badge, Button, Card, Input, Select } from "../ui";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type WeekdayId = "Pzt" | "Sal" | "Çar" | "Per" | "Cum";

function weekdayFromDateIso(iso: string): WeekdayId {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0=Sun
  if (day === 1) return "Pzt";
  if (day === 2) return "Sal";
  if (day === 3) return "Çar";
  if (day === 4) return "Per";
  return "Cum";
}

export default function MatrixView(props: { token: string }) {
  const [day, setDay] = useState<string>(() => todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>(""); // "" => seçilmedi
  const [slotIds, setSlotIds] = useState<number[]>([]);
  const [requiredCapacity, setRequiredCapacity] = useState<string>("40");
  const [useExamCapacity, setUseExamCapacity] = useState<boolean>(true);
  const [purpose, setPurpose] = useState<string>("Sınav");
  const [matrix, setMatrix] = useState<AvailabilityMatrix | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()); // "room_id:slot_id"
  const [lockedUntil, setLockedUntil] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Client-side filters
  const [buildingFilter, setBuildingFilter] = useState<Set<string>>(new Set()); // boş => hepsi
  const [statusFilter, setStatusFilter] = useState<"all" | "only_available" | "only_occupied">("all");
  const [matrixScrollWidth, setMatrixScrollWidth] = useState(0);
  const [matrixViewportWidth, setMatrixViewportWidth] = useState(0);
  const [matrixScrollHeight, setMatrixScrollHeight] = useState(0);
  const [matrixViewportHeight, setMatrixViewportHeight] = useState(0);
  const topScrollbarRef = useRef<HTMLDivElement | null>(null);
  const sideScrollbarRef = useRef<HTMLDivElement | null>(null);
  const matrixScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalSyncSourceRef = useRef<"top" | "matrix" | null>(null);
  const verticalSyncSourceRef = useRef<"side" | "matrix" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [s, c] = await Promise.all([apiSlots(props.token), apiCourses(props.token)]);
        if (cancelled) return;
        setSlots(s);
        setCourses(c);
      } catch {
        // ignore
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshMatrix() {
    const m = await apiAvailability(props.token, day);
    setMatrix(m);
  }

  useEffect(() => {
    refreshMatrix().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    const updateScrollMetrics = () => {
      const scroller = matrixScrollRef.current;
      if (!scroller) return;
      setMatrixScrollWidth(scroller.scrollWidth);
      setMatrixViewportWidth(scroller.clientWidth);
      setMatrixScrollHeight(scroller.scrollHeight);
      setMatrixViewportHeight(scroller.clientHeight);
      if (topScrollbarRef.current && horizontalSyncSourceRef.current !== "top") {
        topScrollbarRef.current.scrollLeft = scroller.scrollLeft;
      }
      if (sideScrollbarRef.current && verticalSyncSourceRef.current !== "side") {
        sideScrollbarRef.current.scrollTop = scroller.scrollTop;
      }
    };

    updateScrollMetrics();

    const scroller = matrixScrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => updateScrollMetrics());
    observer.observe(scroller);
    if (scroller.firstElementChild instanceof HTMLElement) {
      observer.observe(scroller.firstElementChild);
    }

    return () => observer.disconnect();
  }, [matrix, buildingFilter, statusFilter]);

  function syncTopScroll() {
    const top = topScrollbarRef.current;
    const scroller = matrixScrollRef.current;
    if (!top || !scroller) return;
    if (horizontalSyncSourceRef.current === "matrix") {
      horizontalSyncSourceRef.current = null;
      return;
    }
    horizontalSyncSourceRef.current = "top";
    scroller.scrollLeft = top.scrollLeft;
  }

  function syncSideScroll() {
    const side = sideScrollbarRef.current;
    const scroller = matrixScrollRef.current;
    if (!side || !scroller) return;
    if (verticalSyncSourceRef.current === "matrix") {
      verticalSyncSourceRef.current = null;
      return;
    }
    verticalSyncSourceRef.current = "side";
    scroller.scrollTop = side.scrollTop;
  }

  function syncMatrixScroll() {
    const top = topScrollbarRef.current;
    const side = sideScrollbarRef.current;
    const scroller = matrixScrollRef.current;
    if (!scroller) return;
    if (top) {
      if (horizontalSyncSourceRef.current === "top") {
        horizontalSyncSourceRef.current = null;
      } else {
        horizontalSyncSourceRef.current = "matrix";
        top.scrollLeft = scroller.scrollLeft;
      }
    }
    if (side) {
      if (verticalSyncSourceRef.current === "side") {
        verticalSyncSourceRef.current = null;
      } else {
        verticalSyncSourceRef.current = "matrix";
        side.scrollTop = scroller.scrollTop;
      }
    }
  }

  const cellMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of matrix?.cells ?? []) map.set(`${c.room_id}:${c.slot_id}`, c.status);
    return map;
  }, [matrix]);

  const allBuildings = useMemo(() => {
    const s = new Set<string>();
    for (const r of matrix?.rooms ?? []) s.add(r.building || "A");
    return Array.from(s).sort();
  }, [matrix]);

  const filteredRooms = useMemo(() => {
    const rooms = matrix?.rooms ?? [];
    let out = rooms;
    if (buildingFilter.size !== 0) out = out.filter((r) => buildingFilter.has(r.building || "A"));

    if (statusFilter === "all") return out;

    // "Sadece Boşlar": odanın herhangi bir slotunda booked/locked varsa gizle
    // "Sadece Dolular": odanın en az bir slotu booked/locked ise göster
    const hasOccupied = (roomId: number) => {
      for (const s of matrix?.slots ?? []) {
        const st = cellMap.get(`${roomId}:${s.id}`) ?? "available";
        if (st !== "available") return true;
      }
      return false;
    };

    if (statusFilter === "only_available") return out.filter((r) => !hasOccupied(r.id));
    return out.filter((r) => hasOccupied(r.id));
  }, [matrix, buildingFilter, statusFilter, cellMap]);

  const selectedRoomIds = useMemo(() => {
    const ids = new Set<number>();
    for (const key of selectedCells) {
      const [r] = key.split(":");
      ids.add(Number(r));
    }
    return Array.from(ids);
  }, [selectedCells]);

  const totalSelectedCapacity = useMemo(() => {
    const rooms = matrix?.rooms ?? [];
    const byId = new Map<number, any>(rooms.map((r) => [r.id, r]));
    const capKey = useExamCapacity ? "exam_capacity" : "class_capacity";
    let total = 0;
    for (const rid of selectedRoomIds) {
      const r = byId.get(rid);
      if (r) total += Number(r[capKey]) || 0;
    }
    return total;
  }, [matrix, selectedRoomIds, useExamCapacity]);

  function toggleSlot(id: number) {
    setSlotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)));
  }

  function toggleBuilding(b: string) {
    setBuildingFilter((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function toggleCell(roomId: number, slotId: number) {
    const key = `${roomId}:${slotId}`;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSuggest() {
    setError("");
    setSuccess("");
    setLockedUntil("");
    setSuggestion(null);
    setSelectedCells(new Set());
    const cap = Number(requiredCapacity);
    if (!Number.isFinite(cap) || cap <= 0) {
      setError("Kapasite pozitif bir sayı olmalıdır.");
      return;
    }
    if (!slotIds.length) {
      setError("En az 1 slot seçmelisiniz.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiSuggest(props.token, {
        day,
        slot_ids: slotIds,
        required_capacity: cap,
        use_exam_capacity: useExamCapacity,
        purpose,
        course_id: courseId ? Number(courseId) : null
      });
      setSuggestion(res);
      // Öneriyi hücre seçimine dönüştür (room × slotIds)
      const next = new Set<string>();
      for (const r of res.rooms) for (const sid of slotIds) next.add(`${r.id}:${sid}`);
      setSelectedCells(next);
      await refreshMatrix();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function onLock() {
    setError("");
    setSuccess("");
    if (selectedCells.size === 0) {
      setError("En az 1 hücre seçmelisiniz.");
      return;
    }
    setLoading(true);
    try {
      const cells = Array.from(selectedCells).map((k) => {
        const [room_id, slot_id] = k.split(":").map(Number);
        return { room_id, slot_id };
      });
      const res = await apiLockCells(props.token, { day, cells });
      setLockedUntil(res.locked_until);
      await refreshMatrix();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm() {
    setError("");
    setSuccess("");
    if (!lockedUntil) {
      setError("Önce kilitleme yapmalısınız.");
      return;
    }
    setLoading(true);
    try {
      const cells = Array.from(selectedCells).map((k) => {
        const [room_id, slot_id] = k.split(":").map(Number);
        return { room_id, slot_id };
      });
      await apiConfirmCells(props.token, {
        day,
        cells,
        purpose,
        requested_capacity: Number(requiredCapacity) || 0,
        course_id: courseId ? Number(courseId) : null
      });
      setSuccess("Rezervasyon onaylandı.");
      setLockedUntil("");
      setSuggestion(null);
      setSelectedCells(new Set());
      await refreshMatrix();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <Card className="p-4 lg:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Tarih</div>
              <Input value={day} onChange={setDay} type="date" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Kapasite İhtiyacı</div>
              <Input value={requiredCapacity} onChange={setRequiredCapacity} type="number" placeholder="Örn: 40" />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={useExamCapacity ? "green" : "slate"}>Kapasite Türü: {useExamCapacity ? "Sınav Kapasitesi" : "Sınıf Kapasitesi"}</Badge>
                <Button variant="secondary" onClick={() => setUseExamCapacity((v) => !v)}>
                  Değiştir
                </Button>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Amaç</div>
              <Input value={purpose} onChange={setPurpose} placeholder="Sınav / Proje / Etüt" />
              <div className="mt-2 text-xs text-white/50">Ders seçimi opsiyonel. Seçilmezse “ad-hoc” rezervasyon sayılır.</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/60">Ders (opsiyonel)</div>
              <Select value={courseId} onChange={setCourseId}>
                <option value="">Ders seçilmedi</option>
                {courses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:pt-5">
            <Button onClick={onSuggest} disabled={loading}>
              <Sparkles className="h-4 w-4" />
              Akıllı Öneri
            </Button>
            <Button variant="secondary" onClick={onLock} disabled={loading || selectedCells.size === 0}>
              <Lock className="h-4 w-4" />
              Kilitle
            </Button>
            <Button onClick={onConfirm} disabled={loading || !lockedUntil}>
              <CheckCircle2 className="h-4 w-4" />
              Onayla
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 xl:grid-cols-[minmax(0,1.5fr)_220px_240px]">
          <div>
            <div className="text-xs font-semibold text-white/60">Bina Filtresi (client-side)</div>
              <div className="mt-1 flex flex-wrap gap-2">
              {allBuildings.map((b) => {
                const active = buildingFilter.size === 0 ? true : buildingFilter.has(b);
                return (
                  <button
                    key={b}
                    onClick={() => toggleBuilding(b)}
                    className={
                      "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                      (active ? "border-sky-400/40 bg-sky-500/15 text-sky-200" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                    }
                    title="Bina görünürlüğünü aç/kapat"
                  >
                    {b}
                  </button>
                );
              })}
              {allBuildings.length ? (
                <button
                  onClick={() => setBuildingFilter(new Set())}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
                  title="Tüm binaları göster"
                >
                  Tümü
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-white/60">Durum Filtresi</div>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
              className="mt-1"
            >
              <option value="all">Tümü</option>
              <option value="only_available">Sadece Boşlar</option>
              <option value="only_occupied">Sadece Dolular</option>
            </Select>
          </div>

          <div>
            <div className="text-xs font-semibold text-white/60">Seçim</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="slate">Hücre: {selectedCells.size}</Badge>
              <Badge tone="slate">Sınıf: {selectedRoomIds.length}</Badge>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedCells(new Set());
                  setLockedUntil("");
                  setSuggestion(null);
                }}
                disabled={selectedCells.size === 0 && !lockedUntil}
              >
                Seçimi Temizle
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-white/60">Slot Seçimi</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {slots.map((s) => {
              const active = slotIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSlot(s.id)}
                  className={
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                    (active ? "border-sky-400/40 bg-sky-500/15 text-sky-200" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  {s.code} <span className="font-normal text-white/45">({s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)})</span>
                </button>
              );
            })}
          </div>
        </div>

        {suggestion ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold">Önerilen Sınıflar</div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="slate">İhtiyaç: {suggestion.required_capacity}</Badge>
                <Badge tone="green">Toplam: {suggestion.total_capacity}</Badge>
                {lockedUntil ? <Badge tone="yellow">Kilitli (son): {new Date(lockedUntil).toLocaleTimeString("tr-TR")}</Badge> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestion.rooms.map((r) => (
                <Badge key={r.id} tone="slate">
                  {r.name} ({r.capacity})
                </Badge>
              ))}
            </div>
            <div className="mt-2 text-xs text-white/55">
              Eğer tek sınıf yetmezse sistem otomatik olarak aynı slot içinde birden fazla sınıf kombinasyonu önerir.
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>
        ) : null}
      </Card>

      <Card className="flex min-h-[calc(100vh-18rem)] flex-col p-4 lg:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Sınıf Matrisi</div>
            <div className="text-xs text-white/55">
              Her kutu: <span className="font-semibold">Sınıf Kapasitesi</span> + <span className="font-semibold">Sınav Kapasitesi</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">Yeşil: Uygun</Badge>
            <Badge tone="yellow">Sarı: Kilitli</Badge>
            <Badge tone="red">Kırmızı: Dolu</Badge>
          </div>
        </div>

        {!matrix ? (
          <div className="mt-4 text-sm text-white/60">Yükleniyor…</div>
        ) : (
          <div className="mt-5 flex min-h-0 flex-1 flex-col space-y-3">
            {matrixScrollWidth > matrixViewportWidth ? (
              <div
                ref={topScrollbarRef}
                onScroll={syncTopScroll}
                className="overflow-x-auto overflow-y-hidden rounded-xl border border-white/10 bg-slate-950/40"
              >
                <div className="h-4" style={{ width: matrixScrollWidth }} />
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 gap-3">
              <div
                ref={matrixScrollRef}
                onScroll={syncMatrixScroll}
                className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-slate-950/20"
              >
              <div className="min-w-[900px]">
              <div className="grid" style={{ gridTemplateColumns: `260px repeat(${matrix.slots.length}, minmax(140px, 1fr))` }}>
                <div className="sticky left-0 top-0 z-[6] min-w-[260px] border-r border-white/10 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-white/60 shadow-[8px_0_24px_-16px_rgba(15,23,42,0.95)] backdrop-blur">
                  Sınıf
                </div>
                {matrix.slots.map((s) => (
                  <div key={s.id} className="sticky top-0 z-[5] bg-slate-950/95 px-3 py-2 text-xs font-semibold text-white/60 backdrop-blur">
                    {s.code} <span className="font-normal text-white/40">({s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)})</span>
                  </div>
                ))}

                {filteredRooms.map((r) => (
                  <div key={r.id} className="contents">
                    <div className="sticky left-0 z-[3] min-w-[260px] border-r border-t border-white/10 bg-slate-950/95 px-3 py-3 shadow-[8px_0_24px_-16px_rgba(15,23,42,0.95)] backdrop-blur">
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <Badge tone="slate">Bina: {r.building}</Badge>
                        <Badge tone="slate">Sınıf Kapasitesi: {r.class_capacity}</Badge>
                        <Badge tone="slate">Sınav Kapasitesi: {r.exam_capacity}</Badge>
                      </div>
                    </div>
                    {matrix.slots.map((s) => {
                      const st = cellMap.get(`${r.id}:${s.id}`) ?? "available";
                      const sel = selectedCells.has(`${r.id}:${s.id}`);
                      const color =
                        st === "booked"
                          ? "bg-rose-500/20 border-rose-400/20"
                          : st === "locked"
                            ? "bg-amber-500/20 border-amber-400/20"
                            : "bg-emerald-500/10 border-emerald-400/10";
                      const label = st === "booked" ? "Dolu" : st === "locked" ? "Kilitli" : "Uygun";
                      return (
                        <div key={s.id} className="border-t border-white/10 px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (st !== "available") return;
                              toggleCell(r.id, s.id);
                            }}
                            className={
                              "h-16 w-full rounded-2xl border " +
                              color +
                              " flex items-center justify-center text-xs font-semibold transition " +
                              (st === "available" ? "hover:brightness-110" : "cursor-not-allowed opacity-90") +
                              (sel ? " ring-2 ring-sky-400/60" : "")
                            }
                            title={st === "available" ? "Seç/Kaldır (çoklu seçim)" : "Seçilemez"}
                          >
                            {sel ? "Seçildi" : label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                </div>
              </div>
              </div>
              {matrixScrollHeight > matrixViewportHeight ? (
                <div
                  ref={sideScrollbarRef}
                  onScroll={syncSideScroll}
                  className="w-4 shrink-0 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/40"
                  aria-label="Dikey kaydirma cubugu"
                >
                  <div className="w-px" style={{ height: matrixScrollHeight }} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      {selectedRoomIds.length > 0 ? (
        <div className="fixed bottom-5 right-5 z-50">
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur">
            <div className="text-xs font-semibold text-white/60">Toplam Kapasite</div>
            <div className="text-sm font-semibold text-white">
              Toplam: {totalSelectedCapacity} {useExamCapacity ? "sınav" : "sınıf"} kapasitesi seçildi
            </div>
            <div className="mt-1 text-xs text-white/50">Not: aynı sınıf birden fazla slot seçilse de kapasite 1 kez sayılır.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

