import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { logout as apiLogout, me } from "./api";
import { clearSession, getCachedUser, getToken, setSession } from "./authStore";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import type { UserMe } from "./types";
import { Button } from "./ui";

type AuthState = "checking" | "logged_out" | "logged_in";

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("reservation.theme") === "dark" ? "dark" : "light";
  });
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserMe | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
    window.localStorage.setItem("reservation.theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const cachedToken = getToken();
    const cachedUser = getCachedUser();

    if (!cachedToken || !cachedUser) {
      setAuthState("logged_out");
      return;
    }
    const validatedToken = cachedToken;

    async function validateSession() {
      try {
        const currentUser = await me(validatedToken);
        if (cancelled) return;
        setSession(validatedToken, currentUser);
        setToken(validatedToken);
        setUser(currentUser);
        setAuthState("logged_in");
      } catch {
        if (cancelled) return;
        clearSession();
        setToken(null);
        setUser(null);
        setAuthState("logged_out");
      }
    }

    validateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLogin(nextToken: string, nextUser: UserMe) {
    setSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
    setAuthState("logged_in");
  }

  async function handleLogout() {
    const activeToken = token;
    clearSession();
    setToken(null);
    setUser(null);
    setAuthState("logged_out");
    if (!activeToken) return;
    try {
      await apiLogout(activeToken);
    } catch {
      // local session is already cleared
    }
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-white/10">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">Sınıf & Sınav Rezervasyon Sistemi</div>
              <div className="text-xs text-white/55">Işık Üniversitesi</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" className="px-3" onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Aydınlık Mod" : "Dark Mode"}
            </Button>

            {user ? (
              <>
                <div className="user-pill hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/85 md:flex">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  <span className="truncate">{user.email}</span>
                </div>
                <Button variant="secondary" className="px-3" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Çıkış
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {authState === "checking" ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-sm text-white/70">Oturum kontrol ediliyor...</div>
        ) : authState === "logged_in" && token && user ? (
          <Dashboard token={token} user={user} />
        ) : (
          <Login onLogin={handleLogin} />
        )}
      </div>
    </div>
  );
}
