import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, ListChecks, Settings } from "lucide-react";
import { availability as apiAvailability, courses as apiCourses, slots as apiSlots } from "../api";
import type { AvailabilityMatrix, Course, Slot, UserMe } from "../types";
import { Badge, Button, Card } from "../ui";
import MatrixView from "./MatrixView";
import MyReservations from "./MyReservations";
import AdminPanel from "./admin/AdminPanel";

type TabId = "rezervasyon" | "benim" | "admin";

type ReservationBootstrap = {
  day: string;
  slots: Slot[];
  courses: Course[];
  matrix: AvailabilityMatrix | null;
  loading: boolean;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Dashboard(props: { token: string; user: UserMe }) {
  const [tab, setTab] = useState<TabId>(props.user.role === "admin" ? "admin" : "rezervasyon");
  const [reservationBootstrap, setReservationBootstrap] = useState<ReservationBootstrap>({
    day: todayIso(),
    slots: [],
    courses: [],
    matrix: null,
    loading: true
  });

  useEffect(() => {
    let cancelled = false;
    const day = todayIso();

    setReservationBootstrap((prev) => ({ ...prev, day, loading: true }));

    async function preloadReservationData() {
      try {
        const [slotItems, courseItems, matrix] = await Promise.all([
          apiSlots(props.token),
          apiCourses(props.token),
          apiAvailability(props.token, day)
        ]);
        if (cancelled) return;
        setReservationBootstrap({
          day,
          slots: slotItems,
          courses: courseItems,
          matrix,
          loading: false
        });
      } catch {
        if (cancelled) return;
        setReservationBootstrap((prev) => ({ ...prev, loading: false }));
      }
    }

    preloadReservationData();
    return () => {
      cancelled = true;
    };
  }, [props.token]);

  const tabs = useMemo(() => {
    const base: { id: TabId; title: string; icon: JSX.Element }[] = [
      { id: "rezervasyon", title: "Rezervasyon Yap", icon: <LayoutGrid className="h-4 w-4" /> },
      { id: "benim", title: "Rezervasyonlarim", icon: <ListChecks className="h-4 w-4" /> }
    ];
    if (props.user.role === "admin") {
      base.push({ id: "admin", title: "Admin Paneli", icon: <Settings className="h-4 w-4" /> });
    }
    return base;
  }, [props.user.role]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold">Hos geldiniz</div>
            <div className="text-sm text-white/55">Bu panel uzerinden sinif ve sinav rezervasyonlarini yonetebilirsiniz.</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="slate">Rol: {props.user.role === "admin" ? "Admin" : "Kullanici"}</Badge>
            <Badge tone="slate">Oturum: Aktif</Badge>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.title}
          </Button>
        ))}
      </div>

      {tab === "rezervasyon" ? <MatrixView token={props.token} userEmail={props.user.email} bootstrap={reservationBootstrap} /> : null}
      {tab === "benim" ? <MyReservations token={props.token} /> : null}
      {tab === "admin" ? <AdminPanel token={props.token} /> : null}
    </div>
  );
}
