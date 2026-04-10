import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { ApiError, cancelReservation, myReservations } from "../api";
import type { Reservation } from "../types";
import { Badge, Button, Card } from "../ui";

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
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCancel(id: number) {
    setMessage("");
    setError("");
    setLoading(true);
    try {
      const res = await cancelReservation(props.token, id);
      setMessage(res.message);
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Rezervasyonlarım</div>
          <div className="text-xs text-white/55">İptal ettiğinizde slot anında tekrar “Uygun” olur.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="slate">Toplam: {items.length}</Badge>
          <Button variant="secondary" onClick={load} disabled={loading}>
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

      <div className="mt-6 space-y-3">
        {loading && items.length === 0 ? <div className="text-sm text-white/60">Yükleniyor…</div> : null}
        {!loading && items.length === 0 ? <div className="text-sm text-white/60">Henüz rezervasyon yok.</div> : null}

        {items.map((r) => (
          <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {r.room.name} • {r.slot.code} • {new Date(r.day).toLocaleDateString("tr-TR")}
                </div>
                <div className="text-xs text-white/55">
                  {r.slot.start_time.slice(0, 5)}-{r.slot.end_time.slice(0, 5)} • Amaç: {r.purpose} • Kapasite: {r.requested_capacity}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={r.status === "confirmed" ? "green" : "slate"}>{r.status === "confirmed" ? "Onaylı" : "İptal"}</Badge>
                  {r.course ? <Badge tone="slate">Ders: {r.course.code}</Badge> : <Badge tone="slate">Ders: Seçilmedi</Badge>}
                </div>
              </div>
              {r.status === "confirmed" ? (
                <Button variant="danger" onClick={() => onCancel(r.id)} disabled={loading}>
                  <Trash2 className="h-4 w-4" />
                  İptal Et
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

