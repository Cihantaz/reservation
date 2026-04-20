import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Search, Sparkles } from "lucide-react";
import {
  ApiError,
  availability as apiAvailability,
  confirmCells as apiConfirmCells,
  courses as apiCourses,
  lockCells as apiLockCells,
  suggest as apiSuggest,
  slots as apiSlots
} from "../api";
import type { AvailabilityMatrix, Course, Room, Slot, SuggestResponse } from "../types";
import { Badge, Button, Card, Input, Select } from "../ui";

type MatrixStatus = "available" | "locked" | "booked";
type MatrixBootstrap = {
  day: string;
  slots: Slot[];
  courses: Course[];
  matrix: AvailabilityMatrix | null;
  loading: boolean;
};

const ALL_STATUSES: MatrixStatus[] = ["available", "locked", "booked"];

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatCourseLabel(course: Course): string {
  const code = course.code.trim();
  const name = course.name.trim();
  return !name || name.toLowerCase() === code.toLowerCase() ? code : `${code} - ${name}`;
}

function statusLabel(status: MatrixStatus): string {
  if (status === "available") return "Yesil: Uygun";
  if (status === "locked") return "Sari: Kilitli";
  return "Kirmizi: Dolu";
}

function matchesRoomSearch(room: Room, roomQuery: string): boolean {
  const query = roomQuery.trim().toLocaleLowerCase("tr-TR");
  if (!query) return true;
  return [room.name, room.building, room.room_number, room.feature]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query));
}

export default function MatrixView(props: { token: string; bootstrap?: MatrixBootstrap }) {
  const bootstrapDay = props.bootstrap?.day ?? todayIso();
  const [day, setDay] = useState<string>(bootstrapDay);
  const [slots, setSlots] = useState<Slot[]>(() => props.bootstrap?.slots ?? []);
  const [courses, setCourses] = useState<Course[]>(() => props.bootstrap?.courses ?? []);
  const [courseId, setCourseId] = useState<string>("");
  const [slotIds, setSlotIds] = useState<number[]>([]);
  const [requiredCapacity, setRequiredCapacity] = useState<string>("40");
  const [useExamCapacity, setUseExamCapacity] = useState<boolean>(true);
  const [purpose, setPurpose] = useState<string>("Sinav");
  const [matrix, setMatrix] = useState<AvailabilityMatrix | null>(() => props.bootstrap?.matrix ?? null);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lockedUntil, setLockedUntil] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [buildingFilter, setBuildingFilter] = useState<Set<string>>(new Set());
  const [roomQuery, setRoomQuery] = useState<string>("");
  const [visibleStatuses, setVisibleStatuses] = useState<Set<MatrixStatus>>(new Set(ALL_STATUSES));
  const [matrixScrollWidth, setMatrixScrollWidth] = useState(0);
  const [matrixViewportWidth, setMatrixViewportWidth] = useState(0);
  const [matrixScrollHeight, setMatrixScrollHeight] = useState(0);
  const [matrixViewportHeight, setMatrixViewportHeight] = useState(0);
  const topScrollbarRef = useRef<HTMLDivElement | null>(null);
  const sideScrollbarRef = useRef<HTMLDivElement | null>(null);
  const matrixScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalSyncSourceRef = useRef<"top" | "matrix" | null>(null);
  const verticalSyncSourceRef = useRef<"side" | "matrix" | null>(null);

  function clearAllFiltersAndSelections() {
    const resetDay = props.bootstrap?.day ?? todayIso();
    setDay(resetDay);
    setCourseId("");
    setSlotIds([]);
    setRequiredCapacity("40");
    setUseExamCapacity(true);
    setPurpose("Sinav");
    setSuggestion(null);
    setSelectedCells(new Set());
    setLockedUntil("");
    setBuildingFilter(new Set());
    setRoomQuery("");
    setVisibleStatuses(new Set(ALL_STATUSES));
    setError("");
    setSuccess("");
  }

  useEffect(() => {
    if (!props.bootstrap) return;
    if (props.bootstrap.slots.length) {
      setSlots(props.bootstrap.slots);
    }
    if (props.bootstrap.courses.length) {
      setCourses(props.bootstrap.courses);
    }
    if (props.bootstrap.matrix && props.bootstrap.day === day) {
      setMatrix((current) => (current?.day === day ? current : props.bootstrap?.matrix ?? current));
    }
  }, [day, props.bootstrap]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (slots.length > 0 && courses.length > 0) return;
      try {
        const [slotItems, courseItems] = await Promise.all([apiSlots(props.token), apiCourses(props.token)]);
        if (cancelled) return;
        setSlots(slotItems);
        setCourses(courseItems);
      } catch {
        // ignore bootstrap errors in direct-access mode
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [courses.length, props.token, slots.length]);

  async function refreshMatrix() {
    const next = await apiAvailability(props.token, day);
    setMatrix(next);
  }

  useEffect(() => {
    if (props.bootstrap?.matrix && props.bootstrap.day === day) {
      setMatrix((current) => (current?.day === day ? current : props.bootstrap?.matrix ?? current));
      return;
    }
    refreshMatrix().catch(() => void 0);
  }, [day, props.bootstrap, props.token]);

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
  }, [matrix, buildingFilter, roomQuery, visibleStatuses, slotIds]);

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
    const scroller = matrixScrollRef.current;
    if (!scroller) return;

    if (topScrollbarRef.current) {
      if (horizontalSyncSourceRef.current === "top") {
        horizontalSyncSourceRef.current = null;
      } else {
        horizontalSyncSourceRef.current = "matrix";
        topScrollbarRef.current.scrollLeft = scroller.scrollLeft;
      }
    }

    if (sideScrollbarRef.current) {
      if (verticalSyncSourceRef.current === "side") {
        verticalSyncSourceRef.current = null;
      } else {
        verticalSyncSourceRef.current = "matrix";
        sideScrollbarRef.current.scrollTop = scroller.scrollTop;
      }
    }
  }

  const cellMap = useMemo(() => {
    const map = new Map<string, MatrixStatus>();
    for (const cell of matrix?.cells ?? []) {
      map.set(`${cell.room_id}:${cell.slot_id}`, cell.status as MatrixStatus);
    }
    return map;
  }, [matrix]);

  const allBuildings = useMemo(() => {
    const buildingSet = new Set<string>();
    for (const room of matrix?.rooms ?? []) {
      buildingSet.add(room.building || "A");
    }
    return Array.from(buildingSet).sort();
  }, [matrix]);

  const displayedSlots = useMemo(() => {
    const allSlots = matrix?.slots ?? [];
    if (slotIds.length === 0) return allSlots;
    return allSlots.filter((slot) => slotIds.includes(slot.id));
  }, [matrix, slotIds]);

  const baseFilteredRooms = useMemo(() => {
    const rooms = matrix?.rooms ?? [];
    return rooms.filter((room) => {
      if (buildingFilter.size !== 0 && !buildingFilter.has(room.building || "A")) {
        return false;
      }
      return matchesRoomSearch(room, roomQuery);
    });
  }, [buildingFilter, matrix, roomQuery]);

  const suggestableRooms = useMemo(() => {
    return baseFilteredRooms.filter((room) => {
      return slotIds.every((slotId) => (cellMap.get(`${room.id}:${slotId}`) ?? "available") === "available");
    });
  }, [baseFilteredRooms, cellMap, slotIds]);

  const filteredRooms = useMemo(() => {
    const next = baseFilteredRooms;

    if (visibleStatuses.size === ALL_STATUSES.length) return next;

    return next.filter((room) =>
      displayedSlots.some((slot) => {
        const status = cellMap.get(`${room.id}:${slot.id}`) ?? "available";
        return visibleStatuses.has(status);
      })
    );
  }, [baseFilteredRooms, cellMap, displayedSlots, visibleStatuses]);

  const selectedRoomIds = useMemo(() => {
    const ids = new Set<number>();
    for (const key of selectedCells) {
      const [roomId] = key.split(":");
      ids.add(Number(roomId));
    }
    return Array.from(ids);
  }, [selectedCells]);

  const totalSelectedCapacity = useMemo(() => {
    const roomById = new Map((matrix?.rooms ?? []).map((room) => [room.id, room]));
    const capKey = useExamCapacity ? "exam_capacity" : "class_capacity";

    let total = 0;
    for (const roomId of selectedRoomIds) {
      const room = roomById.get(roomId);
      if (room) total += Number(room[capKey]) || 0;
    }
    return total;
  }, [matrix, selectedRoomIds, useExamCapacity]);

  function toggleSlot(id: number) {
    setSlotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)));
  }

  function toggleBuilding(building: string) {
    setBuildingFilter((prev) => {
      if (prev.size === 1 && prev.has(building)) {
        return new Set();
      }
      return new Set([building]);
    });
  }

  function toggleVisibleStatus(status: MatrixStatus) {
    setVisibleStatuses((prev) => {
      if (prev.has(status) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
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
      setError("Kapasite pozitif bir sayi olmalidir.");
      return;
    }
    if (!slotIds.length) {
      setError("En az 1 slot secmelisiniz.");
      return;
    }
    if (baseFilteredRooms.length === 0) {
      setError("Secili sinif/bina filtresinde ve arama sonucunda eslesen sinif bulunamadi.");
      return;
    }
    if (suggestableRooms.length === 0) {
      setError("Secilen slotlarda ve secili filtrelerde uygun ve bos sinif kalmadi.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiSuggest(props.token, {
        day,
        slot_ids: slotIds,
        required_capacity: cap,
        use_exam_capacity: useExamCapacity,
        room_ids: baseFilteredRooms.map((room) => room.id),
        course_id: courseId ? Number(courseId) : null,
        purpose
      });
      setSuggestion(res);
    } catch (e) {
      if (e instanceof ApiError || e instanceof Error) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  async function onLock() {
    setError("");
    setSuccess("");

    if (selectedCells.size === 0) {
      setError("En az 1 hucre secmelisiniz.");
      return;
    }

    setLoading(true);
    try {
      const cells = Array.from(selectedCells).map((key) => {
        const [room_id, slot_id] = key.split(":").map(Number);
        return { room_id, slot_id };
      });
      const res = await apiLockCells(props.token, { day, cells });
      setLockedUntil(res.locked_until);
      await refreshMatrix();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm() {
    setError("");
    setSuccess("");

    if (!lockedUntil) {
      setError("Once kilitleme yapmalisiniz.");
      return;
    }

    setLoading(true);
    try {
      const cells = Array.from(selectedCells).map((key) => {
        const [room_id, slot_id] = key.split(":").map(Number);
        return { room_id, slot_id };
      });

      await apiConfirmCells(props.token, {
        day,
        cells,
        purpose,
        requested_capacity: Number(requiredCapacity) || 0,
        course_id: courseId ? Number(courseId) : null
      });

      setSuccess("Rezervasyon onaylandi.");
      setLockedUntil("");
      setSuggestion(null);
      setSelectedCells(new Set());
      await refreshMatrix();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="matrix-view w-full space-y-4">
      <Card className="p-4 lg:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Tarih</div>
              <Input value={day} onChange={setDay} type="date" />
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Kapasite Ihtiyaci</div>
              <Input value={requiredCapacity} onChange={setRequiredCapacity} type="number" placeholder="Orn: 40" />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={useExamCapacity ? "green" : "slate"}>
                  Kapasite Turu: {useExamCapacity ? "Sinav Kapasitesi" : "Sinif Kapasitesi"}
                </Badge>
                <Button variant="secondary" onClick={() => setUseExamCapacity((value) => !value)}>
                  Degistir
                </Button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Amac</div>
              <Input value={purpose} onChange={setPurpose} placeholder="Sinav / Proje / Etut" />
              <div className="mt-2 text-xs text-white/50">
                Ders secimi opsiyonel. Secilmezse ad-hoc rezervasyon sayilir.
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Ders (opsiyonel)</div>
              <Select value={courseId} onChange={setCourseId}>
                <option value="">Ders secilmedi</option>
                {courses.map((course) => (
                  <option key={course.id} value={String(course.id)}>
                    {formatCourseLabel(course)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:pt-5">
            <Button onClick={onSuggest} disabled={loading}>
              <Sparkles className="h-4 w-4" />
              Akilli Oneri
            </Button>
            <Button variant="secondary" onClick={clearAllFiltersAndSelections} disabled={loading}>
              Filtreleri Temizle
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

        <div className="mt-4 grid gap-2 xl:grid-cols-[minmax(0,1.5fr)_240px]">
          <div>
            <div className="text-xs font-semibold text-white/60">Sinif/Bina Filtresi</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {allBuildings.map((building) => {
                const active = buildingFilter.size === 0 || buildingFilter.has(building);
                return (
                  <button
                    key={building}
                    type="button"
                    onClick={() => toggleBuilding(building)}
                    className={
                      "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                      (active
                        ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                    }
                  >
                    {building}
                  </button>
                );
              })}
              {allBuildings.length ? (
                <button
                  type="button"
                  onClick={() => setBuildingFilter(new Set())}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
                >
                  Tumu
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-white/60">Secim</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="slate">Hucre: {selectedCells.size}</Badge>
              <Badge tone="slate">Sinif: {selectedRoomIds.length}</Badge>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedCells(new Set());
                  setLockedUntil("");
                  setSuggestion(null);
                }}
                disabled={selectedCells.size === 0 && !lockedUntil}
              >
                Secimi Temizle
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-white/60">Slot Secimi</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {slots.map((slot) => {
              const active = slotIds.includes(slot.id);
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => toggleSlot(slot.id)}
                  className={
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                    (active
                      ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  {slot.code} <span className="font-normal text-white/45">({slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)})</span>
                </button>
              );
            })}
          </div>
        </div>

        {suggestion ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold">Onerilen Siniflar</div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="slate">Ihtiyac: {suggestion.required_capacity}</Badge>
                <Badge tone="green">Toplam: {suggestion.total_capacity}</Badge>
                {lockedUntil ? (
                  <Badge tone="yellow">Kilitli (son): {new Date(lockedUntil).toLocaleTimeString("tr-TR")}</Badge>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestion.rooms.map((room) => (
                <Badge key={room.id} tone="slate">
                  {room.name} ({room.capacity})
                </Badge>
              ))}
            </div>
            <div className="mt-2 text-xs text-white/55">
              Bu alan sadece oneridir. Onerilen siniflar otomatik secilmez. Dolu siniflar oneride yer almaz.
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
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}
      </Card>

      <Card className="flex min-h-[calc(100vh-18rem)] flex-col p-4 lg:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Sinif Matrisi</div>
            <div className="text-xs text-white/55">
              Her kutu: <span className="font-semibold">Sinif Kapasitesi</span> + <span className="font-semibold">Sinav Kapasitesi</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => toggleVisibleStatus(status)}
                className={
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                  (visibleStatuses.has(status)
                    ? status === "available"
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                      : status === "locked"
                        ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                        : "border-rose-400/40 bg-rose-500/15 text-rose-100"
                    : "border-white/10 bg-white/5 text-white/55")
                }
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>

        {!matrix ? (
          <div className="mt-4 text-sm text-white/60">Yukleniyor...</div>
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
                className="relative flex-1 overflow-auto rounded-2xl border border-white/10 bg-slate-950/20"
              >
                <div className="min-w-[900px]">
                  <div className="grid" style={{ gridTemplateColumns: `260px repeat(${displayedSlots.length}, minmax(140px, 1fr))` }}>
                    <div className="sticky left-0 top-0 z-[12] min-w-[260px] border-b border-r border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-white/60 shadow-[8px_8px_24px_-16px_rgba(15,23,42,0.95)] backdrop-blur">
                      <div>Sinif</div>
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1.5">
                        <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
                        <input
                          value={roomQuery}
                          onChange={(event) => setRoomQuery(event.target.value)}
                          placeholder="Sinif ara"
                          className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/35"
                        />
                      </div>
                    </div>

                    {displayedSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="sticky top-0 z-[11] border-b border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-white/60 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.95)] backdrop-blur"
                      >
                        {slot.code} <span className="font-normal text-white/40">({slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)})</span>
                      </div>
                    ))}

                    {filteredRooms.map((room) => (
                      <div key={room.id} className="contents">
                        <div className="sticky left-0 z-[9] min-w-[260px] border-r border-t border-white/10 bg-slate-950/95 px-3 py-3 shadow-[8px_0_24px_-16px_rgba(15,23,42,0.95)] backdrop-blur">
                          <div className="text-sm font-semibold">{room.name}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <Badge tone="slate">Bina: {room.building}</Badge>
                            <Badge tone="slate">Sinif Kap.: {room.class_capacity}</Badge>
                            <Badge tone="slate">Sinav Kap.: {room.exam_capacity}</Badge>
                          </div>
                        </div>

                        {displayedSlots.map((slot) => {
                          const status = cellMap.get(`${room.id}:${slot.id}`) ?? "available";
                          const selected = selectedCells.has(`${room.id}:${slot.id}`);
                          const visible = visibleStatuses.has(status);
                          const color =
                            status === "booked"
                              ? "bg-rose-500/20 border-rose-400/20"
                              : status === "locked"
                                ? "bg-amber-500/20 border-amber-400/20"
                                : "bg-emerald-500/10 border-emerald-400/10";
                          const label = status === "booked" ? "Dolu" : status === "locked" ? "Kilitli" : "Uygun";

                          return (
                            <div key={slot.id} className="border-t border-white/10 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => {
                                  if (status !== "available") return;
                                  toggleCell(room.id, slot.id);
                                }}
                                  className={
                                    "flex h-16 w-full items-center justify-center rounded-2xl border text-xs font-semibold transition " +
                                    (visible ? color : "border-white/5 bg-transparent text-transparent") +
                                    (visible
                                      ? status === "available"
                                        ? " hover:brightness-110"
                                        : " cursor-not-allowed opacity-90"
                                      : " cursor-default") +
                                    (visible && selected ? " ring-2 ring-sky-400/60" : "")
                                  }
                                  title={!visible ? "Filtre disi" : status === "available" ? "Sec / Kaldir" : "Secilemez"}
                                >
                                  {visible ? (selected ? "Secildi" : label) : ""}
                                </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {filteredRooms.length === 0 ? (
                      <div className="sticky left-0 z-[9] min-w-[260px] border-r border-t border-white/10 bg-slate-950/95 px-3 py-4 text-xs text-white/55 shadow-[8px_0_24px_-16px_rgba(15,23,42,0.95)] backdrop-blur">
                        Aramaya ve filtreye uyan sinif bulunamadi.
                      </div>
                    ) : null}
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
              Toplam: {totalSelectedCapacity} {useExamCapacity ? "sinav" : "sinif"} kapasitesi secildi
            </div>
            <div className="mt-1 text-xs text-white/50">
              Not: ayni sinif birden fazla slot secilse de kapasite 1 kez sayilir.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
