import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, LogOut, ShieldCheck } from "lucide-react";
import { ApiError, me as apiMe } from "./api";
import { clearSession, getCachedUser, getToken, setSession } from "./authStore";
import type { UserMe } from "./types";
import { Button, Card } from "./ui";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

const DEV_TOKEN = "test-dev-token-123456789";
const DEV_BYPASS_ENABLED = (import.meta as any).env?.VITE_ENABLE_DEV_BYPASS === "true";

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<UserMe | null>(() => getCachedUser());
  const [checking, setChecking] = useState<boolean>(!!token);
  const [error, setError] = useState<string>("");

  // Dev mode: Token bulunamadıysa test token'ı kullan (bypass OTP)
  useEffect(() => {
    if (DEV_BYPASS_ENABLED && !token && !user && !getCachedUser()) {
      const devUser: UserMe = { email: "cihan.tazeoz@isikun.edu.tr", role: "admin" };
      setSession(DEV_TOKEN, devUser);
      setToken(DEV_TOKEN);
      setUser(devUser);
      setChecking(false);
    }
  }, [token, user]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        const u = await apiMe(token);
        if (cancelled) return;
        setUser(u);
      } catch (e) {
        if (cancelled) return;
        // Dev token case: /me fail olsa bile user'ı sakla (OTP bypass)
        if (DEV_BYPASS_ENABLED && token === DEV_TOKEN) {
          console.log("[DEV] Token geçerli, /me fail ancak token saklanıyor");
          return;
        }
        if (e instanceof ApiError) setError(e.message);
        clearSession();
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const header = useMemo(() => {
    return (
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-white/10">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">Sınıf & Sınav Rezervasyon Sistemi</div>
              <div className="text-xs text-white/55">Işık Üniversitesi (Demo)</div>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 md:flex">
                {user.role === "admin" ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : null}
                <span className="truncate">{user.email}</span>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  clearSession();
                  setToken(null);
                  setUser(null);
                }}
              >
                <LogOut className="h-4 w-4" />
                Çıkış
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [user]);

  return (
    <div className="min-h-screen">
      {header}
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {checking ? (
          <Card className="p-8">
            <div className="text-sm text-white/70">Oturum kontrol ediliyor…</div>
          </Card>
        ) : token && user ? (
          <Dashboard token={token} user={user} />
        ) : (
          <Login
            onLogin={(tok, u) => {
              setToken(tok);
              setUser(u);
            }}
          />
        )}

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}
      </div>
    </div>
  );
}

