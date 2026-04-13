import { LayoutGrid, ShieldCheck } from "lucide-react";
import Dashboard from "./components/Dashboard";
import type { UserMe } from "./types";

const DIRECT_TOKEN = "direct-admin-access";
const DIRECT_USER: UserMe = {
  email: "cihan.tazeoz@isikun.edu.tr",
  role: "admin"
};

export default function App() {
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-white/10">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">Sinif & Sinav Rezervasyon Sistemi</div>
              <div className="text-xs text-white/55">Isik Universitesi</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 md:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <span className="truncate">{DIRECT_USER.email}</span>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <Dashboard token={DIRECT_TOKEN} user={DIRECT_USER} />
      </div>
    </div>
  );
}
