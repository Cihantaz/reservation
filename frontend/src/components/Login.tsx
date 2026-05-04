import { useMemo, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { ApiError, requestOtp, verifyOtp } from "../api";
import { setSession } from "../authStore";
import type { UserMe } from "../types";
import { Badge, Button, Card, Input } from "../ui";

export default function Login(props: { onLogin: (token: string, user: UserMe) => void }) {
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  const emailHint = useMemo(() => email.trim().toLowerCase().endsWith("@isikun.edu.tr"), [email]);
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  async function onRequestOtpClick() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await requestOtp(normalizedEmail);
      setOtpSent(true);
      setCode("");
      setInfo("OTP kodu e-posta adresinize gonderildi.");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtpClick() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await verifyOtp(normalizedEmail, code.trim());
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
                setOtpSent(false);
                setCode("");
                setError("");
                setInfo("");
              }}
              placeholder="ad.soyad@isikun.edu.tr"
              disabled={loading || otpSent}
            />
          </div>
          <div className="flex items-center justify-between">
            <Badge tone={emailHint ? "green" : "slate"}>{emailHint ? "Uygun" : "@isikun.edu.tr zorunlu"}</Badge>
            <Badge tone="slate">OTP ile giris</Badge>
          </div>

          {otpSent ? (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-semibold text-white/60">OTP kodu</div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-white/50" />
                <Input
                  value={code}
                  onChange={(value) => {
                    setCode(value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                    setInfo("");
                  }}
                  placeholder="6 haneli kod"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOtpSent(false);
                    setCode("");
                    setError("");
                    setInfo("");
                  }}
                  disabled={loading}
                >
                  E-postayi Degistir
                </Button>
                <Button onClick={onRequestOtpClick} disabled={loading || !emailHint}>
                  Yeniden Gonder
                </Button>
                <Button onClick={onVerifyOtpClick} disabled={loading || code.trim().length < 6}>
                  Giris Yap
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end pt-2">
              <Button onClick={onRequestOtpClick} disabled={loading || !emailHint}>
                Kod Gonder
              </Button>
            </div>
          )}

          {info ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{info}</div> : null}
          {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </Card>
    </div>
  );
}
