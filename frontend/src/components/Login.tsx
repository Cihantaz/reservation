import { useMemo, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { ApiError, testLogin } from "../api";
import { setSession } from "../authStore";
import type { UserMe } from "../types";
import { Badge, Button, Card, Input } from "../ui";

export default function Login(props: { onLogin: (token: string, user: UserMe) => void }) {
  const testLoginEmail = (import.meta as any).env?.VITE_TEST_LOGIN_EMAIL ?? "cihan.tazeoz@isikun.edu.tr";
  const [email, setEmail] = useState<string>(testLoginEmail);
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const emailHint = useMemo(() => {
    return email.trim().toLowerCase().endsWith("@isikun.edu.tr");
  }, [email]);

  async function onTestLogin() {
    setError("");
    setLoading(true);
    try {
      const res = await testLogin(email, password);
      setSession(res.token, res.user);
      props.onLogin(res.token, res.user);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card className="p-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-white/10">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Test Girisi</div>
            <div className="text-sm text-white/55">OTP devre disi. Test sifresi ile giris yapin.</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="text-xs font-semibold text-white/60">Kurumsal e-posta</div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-white/50" />
            <Input value={email} onChange={setEmail} placeholder="ad.soyad@isikun.edu.tr" />
          </div>
          <div className="flex items-center justify-between">
            <Badge tone={emailHint ? "green" : "slate"}>{emailHint ? "Uygun" : "@isikun.edu.tr zorunlu"}</Badge>
            <Badge tone="slate">OTP kapali</Badge>
          </div>

          <div className="mt-4 space-y-3 border-t border-white/10 pt-5">
            <div className="text-xs font-semibold text-white/60">Test Sifresi</div>
            <Input value={password} onChange={setPassword} type="password" placeholder="Test sifresi" />
            <div className="flex items-center justify-end gap-3">
              <Button onClick={onTestLogin} disabled={loading || !emailHint || password.trim().length < 4}>
                Test Girisi
              </Button>
            </div>
          </div>

          {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </Card>
    </div>
  );
}
