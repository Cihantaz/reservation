import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, RefreshCw, Trash2 } from "lucide-react";
import { ApiError, cancelReservation, myReservations } from "../api";
import type { Reservation } from "../types";
import { Badge, Button, Card } from "../ui";

type ReservationGroup = {
  key: string;
  day: string;
  status: Reservation["status"];
  purpose: string;
  requestedCapacity: number;
  courseLabel: string;
  roomNames: string[];
  slotLabels: string[];
  ids: number[];
  createdAt: string;
};

function courseLabelOf(item: Reservation): string {
  if (!item.course) return "Ders secilmedi";
  const code = item.course.code.trim();
  const name = item.course.name.trim();
  return !name || name.toLowerCase() === code.toLowerCase() ? code : `${code} - ${name}`;
}

function slotLabelOf(item: Reservation): string {
  return `${item.slot.code} (${item.slot.start_time.slice(0, 5)}-${item.slot.end_time.slice(0, 5)})`;
}

export default function MyReservations(props: { token: string }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await myReservations(props.token);
      setItems(res);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => void 0);
  }, []);

  const groups = useMemo<ReservationGroup[]>(() => {
    const grouped = new Map<string, ReservationGroup>();

    for (const item of items) {
      const key = [item.day, item.status, item.purpose, item.course?.id ?? "none"].join("|");
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          day: item.day,
          status: item.status,
          purpose: item.purpose,
          requestedCapacity: item.requested_capacity,
          courseLabel: courseLabelOf(item),
          roomNames: [item.room.name],
          slotLabels: [slotLabelOf(item)],
          ids: [item.id],
          createdAt: item.created_at
        });
        continue;
      }

      if (!existing.roomNames.includes(item.room.name)) existing.roomNames.push(item.room.name);
      const slotLabel = slotLabelOf(item);
      if (!existing.slotLabels.includes(slotLabel)) existing.slotLabels.push(slotLabel);
      existing.ids.push(item.id);
      existing.requestedCapacity = Math.max(existing.requestedCapacity, item.requested_capacity);
      if (new Date(item.created_at).getTime() > new Date(existing.createdAt).getTime()) {
        existing.createdAt = item.created_at;
      }
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        roomNames: [...group.roomNames].sort(),
        slotLabels: [...group.slotLabels].sort((a, b) => a.localeCompare(b, "tr")),
        ids: [...group.ids].sort((a, b) => a - b)
      }))
      .sort((a, b) => {
        const dayDiff = new Date(b.day).getTime() - new Date(a.day).getTime();
        if (dayDiff !== 0) return dayDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [items]);

  async function onCancelGroup(group: ReservationGroup) {
    setMessage("");
    setError("");
    setLoading(true);
    try {
      await Promise.all(group.ids.map((id) => cancelReservation(props.token, id)));
      setMessage("Secili rezervasyon grubu iptal edildi.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base font-semibold">Rezervasyonlarim</div>
          <div className="text-sm text-white/55">Ayni gun ve ayni rezervasyon baglamindaki kayitlar tek satirda ozetlenir.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="slate">Ozet Satir: {groups.length}</Badge>
          <Badge tone="slate">Toplam Hucre: {items.length}</Badge>
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Yenile
          </Button>
        </div>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>{error}</div>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
        <div className="hidden grid-cols-[170px_1.2fr_1fr_1fr_120px_140px] gap-3 border-b border-white/10 px-4 py-3 text-sm font-semibold text-white/60 lg:grid">
          <div>Tarih</div>
          <div>Ders / Amac</div>
          <div>Slotlar</div>
          <div>Derslikler</div>
          <div>Kapasite</div>
          <div>Islem</div>
        </div>

        {loading && groups.length === 0 ? <div className="px-4 py-6 text-sm text-white/60">Yukleniyor...</div> : null}
        {!loading && groups.length === 0 ? <div className="px-4 py-6 text-sm text-white/60">Henuz rezervasyon yok.</div> : null}

        {groups.map((group) => (
          <div key={group.key} className="border-b border-white/10 last:border-b-0">
            <div className="grid gap-4 px-4 py-4 lg:grid-cols-[170px_1.2fr_1fr_1fr_120px_140px] lg:items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-sky-300" />
                  {new Date(group.day).toLocaleDateString("tr-TR")}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={group.status === "confirmed" ? "green" : "slate"}>{group.status === "confirmed" ? "Onayli" : "Iptal"}</Badge>
                  <Badge tone="slate">Kayit: {group.ids.length}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">{group.courseLabel}</div>
                <div className="text-sm text-white/65">{group.purpose}</div>
              </div>

              <div className="text-sm text-white/80">{group.slotLabels.join(", ")}</div>

              <div className="text-sm text-white/80">{group.roomNames.join(", ")}</div>

              <div className="space-y-2 text-sm">
                <div className="font-semibold">{group.requestedCapacity}</div>
                <div className="text-white/55">istenen kisi</div>
              </div>

              <div className="flex items-start justify-start lg:justify-end">
                {group.status === "confirmed" ? (
                  <Button variant="danger" onClick={() => onCancelGroup(group)} disabled={loading}>
                    <Trash2 className="h-4 w-4" />
                    Iptal Et
                  </Button>
                ) : (
                  <Badge tone="slate">Pasif</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
