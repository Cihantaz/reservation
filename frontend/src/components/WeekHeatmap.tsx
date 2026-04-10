import { useEffect, useMemo, useState } from "react";
import { ApiError, weekCalendar as apiWeekCalendar } from "../api";
import type { WeekCalendar } from "../types";
import { Badge, Button, Card, Input } from "../ui";
import { AlertTriangle, RefreshCw } from "lucide-react";

function mondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day;
  const x = new Date(d);
  x.setDate(d.getDate() + diff);
  return x;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WeekHeatmap(props: { token: string }) {
  const [startDay, setStartDay] = useState<string>("");
  const [data, setData] = useState<WeekCalendar | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function load() {
    setError("");
    if (!startDay) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiWeekCalendar(props.token, startDay);
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Kullanıcı tarih seçmeden otomatik yükleme yok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay]);

  const cellMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.cells ?? []) map.set(`${c.day}:${c.slot_id}`, c.status);
    return map;
  }, [data]);

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold">Haftalık Isı Haritası</div>
          <div className="text-xs text-white/55">Kırmızı: dolu, Sarı: kilitli, Yeşil: uygun</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs font-semibold text-white/60">Hafta Başlangıcı</div>
            <Input value={startDay} onChange={setStartDay} type="date" />
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Yenile
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>{error}</div>
        </div>
      ) : null}

      {!data ? (
        <div className="mt-6 text-sm text-white/60">
          {loading ? "Yükleniyor…" : startDay ? "Veri yok." : "Lütfen bir başlangıç tarihi seçin."}
        </div>
      ) : (
        <div className="mt-6 overflow-auto">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: `160px repeat(${data.days.length}, minmax(110px, 1fr))` }}>
              <div className="px-3 py-2 text-xs font-semibold text-white/60">Slot</div>
              {data.days.map((d) => (
                <div key={d} className="px-3 py-2 text-xs font-semibold text-white/60">
                  {new Date(d).toLocaleDateString("tr-TR", { weekday: "short", month: "2-digit", day: "2-digit" })}
                </div>
              ))}

              {data.slots.map((s) => (
                <div key={s.id} className="contents">
                  <div className="border-t border-white/10 px-3 py-3">
                    <div className="text-sm font-semibold">{s.code}</div>
                    <div className="text-xs text-white/45">
                      {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                    </div>
                  </div>
                  {data.days.map((d) => {
                    const st = (cellMap.get(`${d}:${s.id}`) ?? "available") as string;
                    const color =
                      st === "booked"
                        ? "bg-rose-500/25 border-rose-400/20"
                        : st === "locked"
                          ? "bg-amber-500/25 border-amber-400/20"
                          : "bg-emerald-500/15 border-emerald-400/10";
                    const label = st === "booked" ? "Dolu" : st === "locked" ? "Kilitli" : "Uygun";
                    return (
                      <div key={d} className="border-t border-white/10 px-3 py-3">
                        <div className={"h-14 rounded-2xl border " + color + " flex items-center justify-center text-xs font-semibold"}>
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone="green">Uygun</Badge>
        <Badge tone="yellow">Kilitli</Badge>
        <Badge tone="red">Dolu</Badge>
      </div>
    </Card>
  );
}

