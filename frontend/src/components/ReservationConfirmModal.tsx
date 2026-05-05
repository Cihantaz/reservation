import { X } from "lucide-react";
import { Button } from "../ui";

export interface ReservationConfirmData {
  date: string;
  slots: Array<{ code: string; start_time: string; end_time: string }>;
  purpose: string;
  course?: { id: number; code: string; name: string } | null;
  rooms: Array<{ id: number; name: string; class_capacity: number; exam_capacity: number }>;
  userEmail: string;
}

export default function ReservationConfirmModal(props: {
  isOpen: boolean;
  data: ReservationConfirmData | null;
  onClose: () => void;
}) {
  if (!props.isOpen || !props.data) return null;

  const slotTimeRange = props.data.slots.length > 0
    ? `${props.data.slots[0].start_time.slice(0, 5)} - ${props.data.slots[props.data.slots.length - 1].end_time.slice(0, 5)}`
    : "N/A";

  const totalCapacity = props.data.rooms.reduce((sum, room) => sum + room.class_capacity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Rezervasyon Onaylandı</h2>
            <p className="mt-1 text-xs text-white/50">Aşağıda rezervasyon detaylarını görebilirsiniz</p>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-lg p-1 hover:bg-white/10 transition"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Tarih */}
          <div>
            <div className="text-xs font-semibold text-white/60 mb-1">Tarih</div>
            <div className="text-base font-semibold text-white">
              {new Date(props.data.date).toLocaleDateString("tr-TR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              })}
            </div>
          </div>

          {/* Slot Bilgileri */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-white/60 mb-1">Seçilen Slotlar</div>
              <div className="space-y-1.5">
                {props.data.slots.map((slot, idx) => (
                  <div key={idx} className="text-sm text-white/80 bg-slate-900/50 rounded px-3 py-2">
                    <div className="font-medium">{slot.code}</div>
                    <div className="text-xs text-white/50">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60 mb-1">Saat Aralığı</div>
              <div className="text-base font-semibold text-white bg-slate-900/50 rounded px-4 py-2.5 h-fit">
                {slotTimeRange}
              </div>
            </div>
          </div>

          {/* Amaç ve Ders */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-white/60 mb-1">Amaç</div>
              <div className="text-base font-semibold text-white">{props.data.purpose}</div>
            </div>

            {props.data.course ? (
              <div>
                <div className="text-xs font-semibold text-white/60 mb-1">Ders</div>
                <div className="text-base font-semibold text-white">
                  {props.data.course.code}
                  {props.data.course.name && props.data.course.code !== props.data.course.name && (
                    <div className="text-xs font-normal text-white/60 mt-0.5">{props.data.course.name}</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Sınıflar */}
          <div>
            <div className="text-xs font-semibold text-white/60 mb-2">Seçilen Sınıflar</div>
            <div className="space-y-1.5">
              {props.data.rooms.map((room) => (
                <div key={room.id} className="text-sm bg-slate-900/50 rounded px-3 py-2.5 flex items-center justify-between">
                  <span className="font-medium text-white">{room.name}</span>
                  <span className="text-xs text-white/50">
                    Sınıf: {room.class_capacity} | Sınav: {room.exam_capacity}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-white/60 bg-slate-900/30 rounded px-3 py-2">
              Toplam Sınıf Kapasitesi: <span className="font-semibold text-white">{totalCapacity}</span>
            </div>
          </div>

          {/* Kullanıcı */}
          <div>
            <div className="text-xs font-semibold text-white/60 mb-1">Giriş Yapan Kullanıcı</div>
            <div className="text-base font-semibold text-white">{props.data.userEmail}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4 flex gap-3 justify-end">
          <Button variant="primary" onClick={props.onClose}>
            Tamam
          </Button>
        </div>
      </div>
    </div>
  );
}
