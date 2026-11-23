// صفحهٔ مدیر «حضور و غیاب»: جدول امروز همهٔ مشاوران، گزارش ماهانه و
// تنظیمات (مرکز دفتر، شعاع، ساعت شیفت‌ها، جمعه غیرکاری).
// فقط مدیر می‌بیند؛ مشاور حضور خودش را از کارت داشبورد ثبت می‌کند.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiJson, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";
import { getTodayJalali, MONTH_NAMES } from "@/lib/jalali";
import { SESSION_STATUS_LABELS, type SessionStatus } from "@/lib/attendance";

type SessionKey = "MORNING" | "EVENING";

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

interface ReportData {
  month: string;
  monthLabel: string;
  workingDays: number;
  users: { id: string; name: string; presentDays: number; lateSessions: number; absentDays: number }[];
}

interface AttendanceSettings {
  officeLat: number;
  officeLng: number;
  radiusM: number;
  morningStart: string;
  morningEnd: string;
  eveningStart: string;
  eveningEnd: string;
  fridayOff: boolean;
}

function timeHHMM(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** ماه‌های شمسی برای انتخاب گزارش: ماه جاری و ۵ ماه پیش. */
function monthOptions(): { value: string; label: string }[] {
  const t = getTodayJalali();
  const out: { value: string; label: string }[] = [];
  let jy = t.jy;
  let jm = t.jm;
  for (let i = 0; i < 6; i++) {
    out.push({
      value: `${jy}-${String(jm).padStart(2, "0")}`,
      label: toFaDigits(`${MONTH_NAMES[jm - 1]} ${jy}`),
    });
    jm--;
    if (jm === 0) {
      jm = 12;
      jy--;
    }
  }
  return out;
}

export default function AttendancePage() {
  const { role, loading: roleLoading } = useRole();
  const [today, setToday] = useState<TodayData | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AttendanceSettings | null>(null);
  const [month, setMonth] = useState(() => {
    const t = getTodayJalali();
    return `${t.jy}-${String(t.jm).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const loadToday = useCallback(async () => {
    const d = await apiJson<TodayData>("/api/attendance/today");
    setToday(d);
  }, []);
  const loadReport = useCallback(async (m: string) => {
    const d = await apiJson<ReportData>(`/api/attendance/report?month=${m}`);
    setReport(d);
  }, []);
  const loadSettings = useCallback(async () => {
    const d = await apiJson<AttendanceSettings>("/api/attendance/settings");
    setSettings(d);
    setSettingsDraft(d);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadToday(), loadReport(month), loadSettings()]);
  }, [loadToday, loadReport, loadSettings, month]);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "OWNER") {
      setLoading(false);
      return;
    }
    void loadAll()
      .catch((e) => setLoadError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [role, roleLoading, loadAll]);

  useEffect(() => {
    if (role !== "OWNER" || !today) return;
    void loadReport(month).catch((e) => setErr(errorMessage(e)));
  }, [month, role, today, loadReport]);

  function flash(ok: string, bad?: string) {
    setMsg(ok);
    setErr(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 3500);
  }

  async function captureOfficeLocation() {
    if (!("geolocation" in navigator)) {
      flash("", "مرورگر شما موقعیت‌یابی ندارد.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSettingsDraft((d) =>
          d ? { ...d, officeLat: Number(pos.coords.latitude.toFixed(6)), officeLng: Number(pos.coords.longitude.toFixed(6)) } : d
        );
        flash("موقعیت فعلی گرفته شد — برای اعمال، ذخیره را بزنید.");
      },
      (e) => {
        setLocating(false);
        flash("", e.code === e.PERMISSION_DENIED ? "دسترسی به موقعیت رد شده است." : "موقعیت پیدا نشد — GPS گوشی را روشن کنید.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSaving(true);
    setErr("");
    try {
      const d = await apiJson<AttendanceSettings>("/api/attendance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      setSettings(d);
      setSettingsDraft(d);
      flash("تنظیمات ذخیره شد.");
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading || roleLoading) return <PageSkeleton rows={3} />;
  if (loadError) return <PageError message={loadError} onRetry={() => { setLoadError(null); setLoading(true); void loadAll().catch((e) => setLoadError(errorMessage(e))).finally(() => setLoading(false)); }} />;
  if (role !== "OWNER") {
    return (
      <div>
        <Header title="حضور و غیاب" subtitle="جدول امروز، گزارش ماهانه و تنظیمات" />
        <div className="p-4 sm:p-6 max-w-2xl">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">این صفحه فقط برای مدیر است.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="حضور و غیاب" subtitle="جدول امروز، گزارش ماهانه و تنظیمات" />
      <div className="p-4 sm:p-6 max-w-[1120px] space-y-6">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}

        {/* جدول امروز */}
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-4 pt-4">
            <CardTitle>امروز {today ? `· ${toFaDigits(today.dateLabel)}` : ""}</CardTitle>
            {today && !today.isWorkingDay && (
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">امروز جمعه است — روز غیرکاری</span>
            )}
            <Button size="sm" variant="outline" onClick={() => void loadToday().catch((e) => setErr(errorMessage(e)))}>به‌روز کردن</Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--paper-2)] text-[11px] text-[var(--ink-3)]">
                  <th className="py-2.5 pr-4 text-right font-medium">مشاور</th>
                  <th className="py-2.5 text-right font-medium">شیفت</th>
                  <th className="py-2.5 text-center font-medium">ورود</th>
                  <th className="py-2.5 text-center font-medium">خروج</th>
                  <th className="py-2.5 text-center font-medium">تاخیر</th>
                  <th className="py-2.5 text-right font-medium">دلیل تاخیر</th>
                  <th className="py-2.5 text-center font-medium">فاصله</th>
                  <th className="py-2.5 text-center font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {(today?.users ?? []).flatMap((u) =>
                  (["MORNING", "EVENING"] as SessionKey[]).map((k) => {
                    const s = u.sessions[k];
                    return (
                      <tr key={`${u.id}:${k}`} className="hover:bg-[var(--paper-2)]/60">
                        <td className="py-3 pr-4 font-medium">{u.name}</td>
                        <td>{k === "MORNING" ? "صبح" : "عصر"} · {toFaDigits(s.start)}–{toFaDigits(s.end)}</td>
                        <td className="text-center">{timeHHMM(s.checkInAt)}</td>
                        <td className="text-center">{timeHHMM(s.checkOutAt)}</td>
                        <td className="text-center">{(s.lateMinutes ?? 0) > 0 ? `${toFaDigits(String(s.lateMinutes))} دقیقه` : "—"}</td>
                        <td className="max-w-[180px] truncate">{s.lateReason ?? "—"}</td>
                        <td className="text-center">{s.checkInDistanceM !== null ? `${toFaDigits(String(s.checkInDistanceM))} متر` : "—"}</td>
                        <td className="text-center">
                          <span className={s.status === "absent" ? "font-bold text-[var(--pomegranate)]" : s.status === "late" ? "font-bold text-amber-700" : ""}>
                            {SESSION_STATUS_LABELS[s.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* گزارش ماهانه */}
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-4 pt-4">
            <CardTitle>گزارش ماهانه</CardTitle>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]">
              {monthOptions().map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--paper-2)] text-[11px] text-[var(--ink-3)]">
                  <th className="py-2.5 pr-4 text-right font-medium">مشاور</th>
                  <th className="py-2.5 text-center font-medium">روزهای کاری</th>
                  <th className="py-2.5 text-center font-medium">حاضر</th>
                  <th className="py-2.5 text-center font-medium">دیرکرد (شیفت)</th>
                  <th className="py-2.5 text-center font-medium">غایب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {(report?.users ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--paper-2)]/60">
                    <td className="py-3 pr-4 font-medium">{u.name}</td>
                    <td className="text-center">{toFaDigits(String(report?.workingDays ?? 0))}</td>
                    <td className="text-center">{toFaDigits(String(u.presentDays))}</td>
                    <td className="text-center">{toFaDigits(String(u.lateSessions))}</td>
                    <td className="text-center">{u.absentDays > 0 ? <span className="font-bold text-[var(--pomegranate)]">{toFaDigits(String(u.absentDays))}</span> : "۰"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report && (
            <p className="px-4 pb-3 text-[11px] text-[var(--ink-3)]">
              {toFaDigits(report.monthLabel)} · غایب فقط روزهای کاریِ گذشته شمرده می‌شود؛ امروز غایب حساب نمی‌شود.
            </p>
          )}
        </Card>

        {/* تنظیمات */}
        {settingsDraft && (
          <Card className="p-4 space-y-4">
            <h3 className="font-bold text-[14px]">تنظیمات حضور و غیاب</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="att-lat">عرض جغرافیایی دفتر</Label>
                <Input id="att-lat" dir="ltr" inputMode="decimal" value={settingsDraft.officeLat} onChange={(e) => setSettingsDraft({ ...settingsDraft, officeLat: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label htmlFor="att-lng">طول جغرافیایی دفتر</Label>
                <Input id="att-lng" dir="ltr" inputMode="decimal" value={settingsDraft.officeLng} onChange={(e) => setSettingsDraft({ ...settingsDraft, officeLng: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label htmlFor="att-radius">شعاع مجاز (متر)</Label>
                <Input id="att-radius" dir="ltr" inputMode="numeric" value={settingsDraft.radiusM} onChange={(e) => setSettingsDraft({ ...settingsDraft, radiusM: Number(e.target.value) || 0 })} />
              </div>
              <div className="flex items-end">
                <Button variant="outline" disabled={locating} onClick={() => void captureOfficeLocation()}>
                  {locating ? "در حال گرفتن موقعیت…" : "ثبت موقعیت فعلی به‌عنوان دفتر"}
                </Button>
              </div>
              <div>
                <Label htmlFor="att-m-start">شروع شیفت صبح</Label>
                <Input id="att-m-start" dir="ltr" value={settingsDraft.morningStart} onChange={(e) => setSettingsDraft({ ...settingsDraft, morningStart: e.target.value })} placeholder="09:00" />
              </div>
              <div>
                <Label htmlFor="att-m-end">پایان شیفت صبح</Label>
                <Input id="att-m-end" dir="ltr" value={settingsDraft.morningEnd} onChange={(e) => setSettingsDraft({ ...settingsDraft, morningEnd: e.target.value })} placeholder="13:00" />
              </div>
              <div>
                <Label htmlFor="att-e-start">شروع شیفت عصر</Label>
                <Input id="att-e-start" dir="ltr" value={settingsDraft.eveningStart} onChange={(e) => setSettingsDraft({ ...settingsDraft, eveningStart: e.target.value })} placeholder="17:00" />
              </div>
              <div>
                <Label htmlFor="att-e-end">پایان شیفت عصر</Label>
                <Input id="att-e-end" dir="ltr" value={settingsDraft.eveningEnd} onChange={(e) => setSettingsDraft({ ...settingsDraft, eveningEnd: e.target.value })} placeholder="21:00" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={settingsDraft.fridayOff}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, fridayOff: e.target.checked })}
              />
              جمعه روز غیرکاری است
            </label>
            <div className="flex gap-2">
              <Button disabled={saving} onClick={() => void saveSettings()}>{saving ? "در حال ذخیره…" : "ذخیره تنظیمات"}</Button>
              {settings && (
                <Button variant="ghost" disabled={saving} onClick={() => setSettingsDraft(settings)}>بازگردانی</Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
