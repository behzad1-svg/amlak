// کارت «حضور امروز» در داشبورد — برای همهٔ کاربران واردشده.
// ورود/خروج با GPS گوشی ثبت می‌شود؛ بدون عکس و بدون تشخیص چهره.
// اگر ورود دیر باشد، یک فیلد آزاد «دلیل تاخیر:» نشان داده می‌شود و
// مشاور دلیلش را خودش می‌نویسد — هیچ گزینهٔ آماده‌ای نیست.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { apiJson, ApiError, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";
import { formatJalali } from "@/lib/jalali";
import {
  CHECKOUT_REASON_MAX,
  LATE_GRACE_MINUTES,
  LATE_REASON_MAX,
  LEAVE_REASON_MAX,
  LEAVE_SCOPE_LABELS,
  type LeaveScope,
} from "@/lib/attendance";

type SessionKey = "MORNING" | "EVENING";
type SessionStatus = "done" | "working" | "late" | "absent" | "open" | "upcoming" | "off" | "leave";

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
  checkOutReason: string | null;
  checkOutDistanceM: number | null;
  leaveReason: string | null;
}

interface LeaveItem {
  id: string;
  date: string;
  scope: LeaveScope;
  scopeLabel: string;
  reason: string | null;
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
  leave: "مرخصی",
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
  // خروج از بیرون محدوده — اول پیام + فیلد دلیل، بعد ثبت با دلیل
  const [outOfRangeFor, setOutOfRangeFor] = useState<SessionKey | null>(null);
  const [outReason, setOutReason] = useState("");
  const [pendingPos, setPendingPos] = useState<{ lat: number; lng: number } | null>(null);
  const [outDistanceM, setOutDistanceM] = useState<number | null>(null);
  // مرخصی — بدون تایید مدیر؛ مهلت: روز قبل، یا در خودِ روز تا یک ساعت پس از شروع شیفت
  const [myLeaves, setMyLeaves] = useState<LeaveItem[]>([]);
  const [leaveDate, setLeaveDate] = useState<string | null>(null);
  const [leaveScope, setLeaveScope] = useState<LeaveScope>("FULL_DAY");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);

  const loadLeaves = useCallback(async () => {
    try {
      const d = await apiJson<{ leaves: LeaveItem[] }>("/api/attendance/leave");
      setMyLeaves(d.leaves);
    } catch {
      // فهرست مرخصی فرعی است؛ خطایش کارت حضور را خراب نمی‌کند
    }
  }, []);

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
    void (async () => { await load(); await loadLeaves(); })();
  }, [load, loadLeaves]);

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
    // ورود دیر است؟ ۲۰ دقیقهٔ اول پس از شروع شیفت دیرکرد حساب نمی‌شود؛
    // فقط پس از آن اول دلیل را بگیر، بعد موقعیت و ثبت
    if (nowTehranMinutes() > hhmmToMin(start) + LATE_GRACE_MINUTES) {
      setReasonFor(sessionKey);
      setErr("");
      return;
    }
    await submitCheckIn(sessionKey, "");
  }

  async function submitCheckOut(sessionKey: SessionKey, reasonText: string, pos: { lat: number; lng: number }) {
    setBusy(sessionKey);
    setErr("");
    try {
      await apiJson("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng, reason: reasonText.trim() || undefined }),
      });
      setOutOfRangeFor(null);
      setOutReason("");
      setPendingPos(null);
      setOutDistanceM(null);
      flash("خروج ثبت شد.");
      await load();
    } catch (e) {
      // بیرون محدودهٔ دفتر: خروج دلیل می‌خواهد، نه ردِ کامل
      if (e instanceof ApiError && e.data?.outOfRange === true) {
        setPendingPos(pos);
        setOutOfRangeFor(sessionKey);
        setOutDistanceM(typeof e.data.distanceM === "number" ? e.data.distanceM : null);
        return;
      }
      flash("", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onCheckOut(sessionKey: SessionKey) {
    setBusy(sessionKey);
    setErr("");
    try {
      const pos = await getPosition();
      await submitCheckOut(sessionKey, "", { lat: pos.coords.latitude, lng: pos.coords.longitude });
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

  async function submitLeave() {
    if (!leaveDate) {
      flash("", "اول روز مرخصی را انتخاب کن.");
      return;
    }
    setLeaveBusy(true);
    setErr("");
    try {
      await apiJson("/api/attendance/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateIso: leaveDate,
          scope: leaveScope,
          reason: leaveReason.trim() || undefined,
        }),
      });
      setLeaveDate(null);
      setLeaveReason("");
      flash("مرخصی ثبت شد.");
      await loadLeaves();
      await load();
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setLeaveBusy(false);
    }
  }

  async function cancelLeave(id: string) {
    setLeaveBusy(true);
    setErr("");
    try {
      await apiJson(`/api/attendance/leave?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      flash("مرخصی لغو شد.");
      await loadLeaves();
      await load();
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setLeaveBusy(false);
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
                    {s.checkOutReason ? ` · دلیل خروج: ${s.checkOutReason}` : ""}
                    {s.status === "leave" && s.leaveReason ? ` · ${s.leaveReason}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!s.checkInAt && s.status === "open" && (
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
              {outOfRangeFor === s.session && (
                <div className="mt-3 space-y-2 rounded-[12px] border border-[var(--line)] bg-white p-3">
                  <p className="text-[13px] font-bold">
                    شما خارج از محدوده دفتر هستید
                    {outDistanceM !== null ? ` — فاصله‌تان ${toFaDigits(String(outDistanceM))} متر است` : ""}.
                  </p>
                  <Label htmlFor={`checkout-reason-${s.session}`}>دلیل خروج:</Label>
                  <Input
                    id={`checkout-reason-${s.session}`}
                    value={outReason}
                    maxLength={CHECKOUT_REASON_MAX}
                    onChange={(e) => setOutReason(e.target.value)}
                    placeholder="مثلا بازدید بودم"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy !== null || !outReason.trim() || !pendingPos} onClick={() => pendingPos && void submitCheckOut(s.session, outReason, pendingPos)}>
                      {busy === s.session ? "در حال ثبت…" : "ثبت خروج"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setOutOfRangeFor(null); setOutReason(""); setPendingPos(null); setOutDistanceM(null); }}>
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

        {/* ثبت مرخصی — بدون تایید مدیر */}
        <div className="space-y-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
          <div className="text-[13px] font-bold">ثبت مرخصی</div>
          <p className="text-[11px] text-[var(--ink-3)]">
            مرخصی را باید روز قبل ثبت کنی، یا در خودِ روز حداکثر تا یک ساعت پس از شروع شیفت؛ بعد از آن سیستم اجازه نمی‌دهد.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="leave-date">روز مرخصی</Label>
              <JalaliDatePicker id="leave-date" value={leaveDate} onChange={setLeaveDate} placeholder="انتخاب روز" />
            </div>
            <div>
              <Label htmlFor="leave-scope">بازه</Label>
              <Select id="leave-scope" value={leaveScope} onChange={(e) => setLeaveScope(e.target.value as LeaveScope)}>
                {(Object.keys(LEAVE_SCOPE_LABELS) as LeaveScope[]).map((k) => (
                  <option key={k} value={k}>{LEAVE_SCOPE_LABELS[k]}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="leave-reason">دلیل (اختیاری)</Label>
            <Input
              id="leave-reason"
              value={leaveReason}
              maxLength={LEAVE_REASON_MAX}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="مثلا کار شخصی"
            />
          </div>
          <div>
            <Button size="sm" disabled={leaveBusy || !leaveDate} onClick={() => void submitLeave()}>
              {leaveBusy ? "در حال ثبت…" : "ثبت مرخصی"}
            </Button>
          </div>
          {myLeaves.length > 0 && (
            <ul className="space-y-1 pt-1 text-[12.5px]">
              {myLeaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span>
                    {formatJalali(l.date)} · {l.scopeLabel}
                    {l.reason ? ` · ${l.reason}` : ""}
                  </span>
                  <Button size="sm" variant="ghost" disabled={leaveBusy} onClick={() => void cancelLeave(l.id)}>
                    لغو
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
