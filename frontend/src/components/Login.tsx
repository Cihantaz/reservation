import { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { ApiError, login } from "../api";
import { setSession } from "../authStore";
import type { UserMe } from "../types";
import { Badge, Button, Card, Input } from "../ui";

export default function Login(props: { onLogin: (token: string, user: UserMe) => void }) {
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const emailHint = useMemo(() => email.trim().toLowerCase().endsWith("@isikun.edu.tr"), [email]);

  async function onLoginClick() {
    setError("");
    setLoading(true);
    try {
      const res = await login(email);
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
      <Card className="mx-auto w-full max-w-xl p-8">
        <div>
          <div className="text-base font-semibold">Kurumsal Giris</div>
          <div className="text-sm text-white/55">Kurumsal e-posta adresiniz ile giris yapin.</div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="text-xs font-semibold text-white/60">Kurumsal e-posta</div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-white/50" />
            <Input
              value={email}
              onChange={(value) => {
                setEmail(value);
                setError("");
              }}
              placeholder="ad.soyad@isikun.edu.tr"
            />
          </div>
          <div className="flex items-center justify-between">
            <Badge tone={emailHint ? "green" : "slate"}>{emailHint ? "Uygun" : "@isikun.edu.tr zorunlu"}</Badge>
            <Badge tone="slate">Mail ile giris</Badge>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onLoginClick} disabled={loading || !emailHint}>
              Giris Yap
            </Button>
          </div>

          {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </Card>
    </div>
  );
}
