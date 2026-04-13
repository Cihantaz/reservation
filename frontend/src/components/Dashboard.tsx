import { useMemo, useState } from "react";
import { CalendarDays, LayoutGrid, ListChecks, Settings } from "lucide-react";
import type { UserMe } from "../types";
import { Badge, Button, Card } from "../ui";
import MatrixView from "./MatrixView";
import WeekHeatmap from "./WeekHeatmap";
import MyReservations from "./MyReservations";
import AdminPanel from "./admin/AdminPanel";

type TabId = "rezervasyon" | "takvim" | "benim" | "admin";

export default function Dashboard(props: { token: string; user: UserMe }) {
  const [tab, setTab] = useState<TabId>(props.user.role === "admin" ? "admin" : "rezervasyon");

  const tabs = useMemo(
    () => {
      const base: { id: TabId; title: string; icon: JSX.Element }[] = [
        { id: "rezervasyon" as const, title: "Rezervasyon Yap", icon: <LayoutGrid className="h-4 w-4" /> },
        { id: "takvim" as const, title: "Haftalık Takvim", icon: <CalendarDays className="h-4 w-4" /> },
        { id: "benim" as const, title: "Rezervasyonlarım", icon: <ListChecks className="h-4 w-4" /> }
      ];
      if (props.user.role === "admin") {
        base.push({ id: "admin" as const, title: "Admin Paneli", icon: <Settings className="h-4 w-4" /> });
      }
      return base;
    },
    [props.user.role]
  );

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Hoş geldiniz</div>
            <div className="text-xs text-white/55">Bu panel üzerinden sınıf/sınav rezervasyonlarını yönetebilirsiniz.</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="slate">Rol: {props.user.role === "admin" ? "Admin" : "Kullanıcı"}</Badge>
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

      {tab === "rezervasyon" ? <MatrixView token={props.token} /> : null}
      {tab === "takvim" ? <WeekHeatmap token={props.token} /> : null}
      {tab === "benim" ? <MyReservations token={props.token} /> : null}
      {tab === "admin" ? <AdminPanel token={props.token} /> : null}
    </div>
  );
}

