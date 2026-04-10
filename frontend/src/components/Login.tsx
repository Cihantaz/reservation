import { useMemo, useState } from "react";
import { KeyRound, Mail, TerminalSquare } from "lucide-react";
import { ApiError, requestOtp, verifyOtp } from "../api";
import { setSession } from "../authStore";
import type { UserMe } from "../types";
import { Badge, Button, Card, Input } from "../ui";

export default function Login(props: { onLogin: (token: string, user: UserMe) => void }) {
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const showDevOtpHint = (import.meta as any).env?.DEV || (import.meta as any).env?.VITE_SHOW_DEV_OTP_HINT === "true";

  const emailHint = useMemo(() => {
    return email.trim().toLowerCase().endsWith("@isikun.edu.tr");
  }, [email]);

  async function onRequestOtp() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await requestOtp(email);
      setMessage("OTP kodu e-posta adresinize gonderildi.");
      setStep("otp");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await verifyOtp(email, code);
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
    <div className={`grid gap-6 ${showDevOtpHint ? "md:grid-cols-2" : ""}`}>
      <Card className="p-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-white/10">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Giris</div>
            <div className="text-sm text-white/55">OTP dogrulama ile guvenli erisim</div>
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
            <Button onClick={onRequestOtp} disabled={loading || !emailHint}>
              OTP Gonder
            </Button>
          </div>

          {step === "otp" ? (
            <div className="mt-6 space-y-3">
              <div className="text-xs font-semibold text-white/60">OTP Kodu</div>
              <Input value={code} onChange={setCode} placeholder="6 haneli kod" />
              <div className="flex items-center justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep("email")} disabled={loading}>
                  Geri
                </Button>
                <Button onClick={onVerifyOtp} disabled={loading || code.trim().length < 4}>
                  Giris Yap
                </Button>
              </div>
            </div>
          ) : null}

          {message ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
          {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </Card>

      {showDevOtpHint ? (
        <Card className="p-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-200 ring-1 ring-white/10">
              <TerminalSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold">Gelistirme Notu</div>
              <div className="text-sm text-white/55">Mail gonderimi bu ortamda simule edilir</div>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-white/75">
            <div>OTP kodu, backend calistigi terminalde su formatla gorunur:</div>
            <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 font-mono text-xs text-white/80">
              [OTP] ad.soyad@isikun.edu.tr icin dogrulama kodu: 123456
            </div>
            <div className="text-white/55">Bu not sadece gelistirme ortami icindir. Prod ortaminda gercek bir e-posta servisi gerekir.</div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
