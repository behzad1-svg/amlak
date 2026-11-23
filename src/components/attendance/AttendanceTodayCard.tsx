// کارت «حضور امروز» در داشبورد — برای همهٔ کاربران واردشده.
// ورود/خروج با GPS گوشی ثبت می‌شود؛ بدون عکس و بدون تشخیص چهره.
// اگر ورود دیر باشد، یک فیلد آزاد «دلیل تاخیر:» نشان داده می‌شود و
// مشاور دلیلش را خودش می‌نویسد — هیچ گزینهٔ آماده‌ای نیست.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { apiJson, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";
import { LATE_REASON_MAX } from "@/lib/attendance";

type SessionKey = "MORNING" | "EVENING";
type SessionStatus = "done" | "working" | "late" | "absent" | "open" | "upcoming" | "off";

interface SessionView {
  session: SessionKey;
  start: string;
  end: string;
  status: SessionStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number | null;
  lateReason: string | null;
  checkInDistanceM: number | null;
}

interface TodayData {
  dateLabel: string;
  isWorkingDay: boolean;
  settings: { morningStart: string; morningEnd: string; eveningStart: string; eveningEnd: string; radiusM: number };
  users: { id: string; name: string; role: string; sessions: Record<SessionKey, SessionView> }[];
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  done: "حاضر",
  working: "در حال کار",
  late: "دیرکرد",
  absent: "غایب",
  open: "در انتظار ورود",
  upcoming: "شروع نشده",
  off: "تعطیل",
};

function timeHHMM(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** دقیقه‌های اکنون تهران — برای اینکه بدانیم ورود دیر است یا نه. */
function nowTehranMinutes(): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("مرورگر شما موقعیت‌یابی ندارد."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error("دسترسی به موقعیت رد شده است — از تنظیمات مرورگر اجازه بدهید و دوباره تلاش کنید."));
      } else if (err.code === err.TIMEOUT) {
        reject(new Error("دریافت موقعیت طول کشید — دوباره تلاش کنید."));
      } else {
        reject(new Error("موقعیت پیدا نشد — GPS گوشی را روشن کنید و دوباره تلاش کنید."));
      }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

export function AttendanceTodayCard() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SessionKey | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // فیلد دلیل تاخیر — فقط برای شیفتی که ورودش دیر است باز می‌شود
  const [reasonFor, setReasonFor] = useState<SessionKey | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiJson<TodayData>("/api/attendance/today");
      setData(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(ok: string, bad?: string) {
    setMsg(ok);
    setErr(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 3500);
  }

  async function submitCheckIn(sessionKey: SessionKey, reasonText: string) {
    setBusy(sessionKey);
    setErr("");
    try {
      const pos = await getPosition();
      await apiJson("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          reason: reasonText.trim() || undefined,
        }),
      });
      setReasonFor(null);
      setReason("");
      flash("ورود ثبت شد.");
      await load();
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onCheckIn(sessionKey: SessionKey, start: string) {
    // ورود دیر است؟ اول دلیل را بگیر، بعد موقعیت و ثبت
    if (nowTehranMinutes() > hhmmToMin(start)) {
      setReasonFor(sessionKey);
      setErr("");
      return;
    }
    await submitCheckIn(sessionKey, "");
  }

  async function onCheckOut(sessionKey: SessionKey) {
    setBusy(sessionKey);
    setErr("");
    try {
      const pos = await getPosition();
      await apiJson("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      });
      flash("خروج ثبت شد.");
      await load();
    } catch (e) {
      // اگر موقعیت در دسترس نبود، خروج بدون موقعیت هم قبول است
      if (e instanceof Error && e.message.includes("موقعیت")) {
        try {
          await apiJson("/api/attendance/check-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          flash("خروج ثبت شد.");
          await load();
          return;
        } catch (e2) {
          flash("", errorMessage(e2));
        }
      } else {
        flash("", errorMessage(e));
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (loadError || !data) return null;
  const me = data.users[0];
  if (!me) return null;
  const sessions: SessionView[] = [me.sessions.MORNING, me.sessions.EVENING];

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--sea)] text-white"><Clock3 className="h-4 w-4" /></span>
          حضور امروز
        </CardTitle>
        <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{toFaDigits(data.dateLabel)}</span>
      </CardHeader>
      <div className="px-4 pb-4 space-y-3">
        {!data.isWorkingDay ? (
          <p className="py-2 text-center text-[13px] text-[var(--ink-3)]">امروز جمعه است — روز غیرکاری.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.session} className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-bold">
                    شیفت {s.session === "MORNING" ? "صبح" : "عصر"} · {toFaDigits(s.start)} تا {toFaDigits(s.end)}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--ink-3)]">
                    وضعیت: {STATUS_LABEL[s.status]}
                    {s.checkInAt ? ` · ورود ${timeHHMM(s.checkInAt)}` : ""}
                    {s.checkOutAt ? ` · خروج ${timeHHMM(s.checkOutAt)}` : ""}
                    {(s.lateMinutes ?? 0) > 0 ? ` · تاخیر ${toFaDigits(String(s.lateMinutes ?? 0))} دقیقه` : ""}
                    {s.lateReason ? ` · دلیل: ${s.lateReason}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!s.checkInAt && (s.status === "open" || s.status === "upcoming" || s.status === "absent") && (
                    <Button size="sm" disabled={busy !== null} onClick={() => void onCheckIn(s.session, s.start)}>
                      {busy === s.session ? "در حال ثبت…" : "ثبت ورود"}
                    </Button>
                  )}
                  {s.checkInAt && !s.checkOutAt && (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void onCheckOut(s.session)}>
                      {busy === s.session ? "در حال ثبت…" : "ثبت خروج"}
                    </Button>
                  )}
                  {s.checkOutAt && <span className="text-[12px] font-bold text-[var(--sea)]">✓ ثبت شد</span>}
                </div>
              </div>
              {reasonFor === s.session && (
                <div className="mt-3 space-y-2 rounded-[12px] border border-[var(--line)] bg-white p-3">
                  <Label htmlFor={`late-reason-${s.session}`}>دلیل تاخیر:</Label>
                  <Input
                    id={`late-reason-${s.session}`}
                    value={reason}
                    maxLength={LATE_REASON_MAX}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثلا بازدید بودم"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => void submitCheckIn(s.session, reason)}>
                      {busy === s.session ? "در حال ثبت…" : "ثبت ورود"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setReasonFor(null); setReason(""); }}>
                      انصراف
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {msg && <p className="text-[12.5px] font-medium text-[var(--sea)]">{msg}</p>}
        {err && <p className="text-[12.5px] font-medium text-red-700">{err}</p>}
        <p className="text-[11px] text-[var(--ink-3)]">
          ورود فقط داخل شعاع {toFaDigits(String(data.settings.radiusM))} متری دفتر ثبت می‌شود؛ موقعیت گوشی باید روشن باشد.
        </p>
      </div>
    </Card>
  );
}
