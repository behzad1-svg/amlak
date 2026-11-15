// نقد ۱، ۵ و ۶ — مدیریت با کمک‌کنندهٔ مرکزی (خطای بارگذاری + تلاش دوباره)،
// دکمه‌های خروجی CSV برای پشتیبان‌گیری، و بخش لاگ خطاهای سرور برای مدیر.
// پیام خطا تا اقدام بعدی می‌ماند؛ فقط پیام موفقیت خودبه‌خود پاک می‌شود.
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, PasswordInput, PhoneInput, Select } from "@/components/ui/Input";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

type Breakdown = {
  calls: number;
  notes: number;
  meetings: number;
  messages: number;
  appraisals: number;
  viewingsDone: number;
  stageChanges: number;
  advertised: number;
  other: number;
};

type TeamStat = {
  id: string;
  name: string;
  role: string;
  overdue: number;
  weeklyActivity: number;
  monthlyActivity: number;
  deals: number;
  appraisals: number;
  listedFiles: number;
  viewings: number;
  breakdown: Breakdown;
};

type AdminUser = {
  id: string;
  name: string;
  phone: string;
  role: "OWNER" | "AGENT";
  active: boolean;
};

type ActivityRow = {
  id: string;
  type: string;
  description: string | null;
  createdAt: string;
  agent?: { name: string };
  customer?: { id: string; name: string } | null;
};

type ErrorLogRow = {
  id: string;
  route: string;
  method: string;
  status: number;
  message: string;
  createdAt: string;
};

type DashboardData = { teamStats: TeamStat[] | null };

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogRow[]>([]);
  const [errorLogsUnavailable, setErrorLogsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<TeamStat | null>(null);
  const [agentActivities, setAgentActivities] = useState<ActivityRow[]>([]);
  const [loadingActs, setLoadingActs] = useState(false);

  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "AGENT" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", phone: "", role: "AGENT", active: true, password: "" });

  const flash = useCallback((ok: string, bad?: string) => {
    setMsg(ok);
    setErr(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, usersRes, logsRes] = await Promise.all([
        apiJson<DashboardData>("/api/dashboard"),
        apiJson<AdminUser[]>("/api/users"),
        apiJson<{ logs?: ErrorLogRow[]; unavailable?: boolean }>("/api/admin/error-logs?limit=50").catch(() => ({ logs: [], unavailable: true })),
      ]);
      setData(dash);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setErrorLogs(logsRes.logs ?? []);
      setErrorLogsUnavailable(Boolean(logsRes.unavailable));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // بارگذاری اولیهٔ داده — الگوی استاندارد صفحه‌های کلاینتی
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function openAgentStats(a: TeamStat) {
    setSelectedAgent(a);
    setLoadingActs(true);
    setAgentActivities([]);
    try {
      const d = await apiJson<{ activities?: ActivityRow[] } | ActivityRow[]>(`/api/activities?agentId=${a.id}&limit=50`);
      setAgentActivities(Array.isArray(d) ? d : d?.activities ?? []);
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setLoadingActs(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", phone: "", password: "", role: "AGENT" });
      flash("کاربر ساخته شد");
      load();
    } catch (err2) {
      flash("", errorMessage(err2));
    } finally {
      setSaving(false);
    }
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setErr("");
    const body: Record<string, unknown> = {
      name: edit.name,
      phone: edit.phone,
      role: edit.role,
      active: edit.active,
    };
    if (edit.password) body.password = edit.password;
    try {
      await apiFetch(`/api/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditId(null);
      setEdit({ name: "", phone: "", role: "AGENT", active: true, password: "" });
      flash("کاربر به‌روزرسانی شد");
      load();
    } catch (err2) {
      flash("", errorMessage(err2));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    setErr("");
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !u.active }),
      });
      flash(u.active ? "کاربر غیرفعال شد" : "کاربر فعال شد");
      load();
    } catch (err2) {
      flash("", errorMessage(err2));
    }
  }

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError || !data) return <PageError message={loadError ?? "داده بارگذاری نشد."} onRetry={load} />;

  return (
    <div>
      <Header title="مدیریت" subtitle="آمار فعالیت تیم و کاربران" />
      <div className="p-4 sm:p-6 space-y-6 max-w-[1200px]">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}

        <Card>
          <CardHeader>
            <CardTitle>آمار فعالیت مشاوران</CardTitle>
            <span className="text-[11px] text-[var(--ink-3)]">روی هر ردیف کلیک کنید تا جزئیات فعالیت‌ها باز شود</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-500 text-[12px]">
                  <th className="py-2 text-right">مشاور</th>
                  <th>عقب‌افتاده</th>
                  <th>فعالیت هفته</th>
                  <th>فعالیت ماه</th>
                  <th>کارشناسی</th>
                  <th>فایل ثبت‌شده</th>
                  <th>بازدید</th>
                  <th>معامله</th>
                </tr>
              </thead>
              <tbody>
                {(data.teamStats ?? []).map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openAgentStats(s)}
                    className={`border-b last:border-0 cursor-pointer hover:bg-[var(--paper-2)] ${
                      selectedAgent?.id === s.id ? "bg-[var(--paper-2)]" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-2 font-medium text-right">
                      {s.name} {s.role === "OWNER" ? "(مدیر)" : ""}
                    </td>
                    <td className="text-center">
                      <span className={s.overdue > 0 ? "text-red-600 font-bold" : ""}>{s.overdue}</span>
                    </td>
                    <td className="text-center">{s.weeklyActivity}</td>
                    <td className="text-center">{s.monthlyActivity}</td>
                    <td className="text-center font-bold text-[var(--sea)]">{s.appraisals}</td>
                    <td className="text-center">{s.listedFiles}</td>
                    <td className="text-center">{s.viewings}</td>
                    <td className="text-center font-bold">{s.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {selectedAgent && (
          <Card>
            <CardHeader>
              <CardTitle>جزئیات فعالیت — {selectedAgent.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedAgent(null)}>بستن</Button>
            </CardHeader>
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {([
                ["تماس", selectedAgent.breakdown?.calls ?? 0],
                ["یادداشت", selectedAgent.breakdown?.notes ?? 0],
                ["جلسه", selectedAgent.breakdown?.meetings ?? 0],
                ["کارشناسی", selectedAgent.breakdown?.appraisals ?? 0],
                ["بازدید", selectedAgent.breakdown?.viewingsDone ?? 0],
                ["پیام", selectedAgent.breakdown?.messages ?? 0],
                ["تغییر مرحله", selectedAgent.breakdown?.stageChanges ?? 0],
                ["آگهی", selectedAgent.breakdown?.advertised ?? 0],
                ["سایر", selectedAgent.breakdown?.other ?? 0],
              ] as const).map(([label, n]) => (
                <div key={label} className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">{label}</div>
                  <div className="text-[18px] font-extrabold">{n}</div>
                </div>
              ))}
            </div>
            <div className="text-[12px] font-bold mb-2">آخرین فعالیت‌ها (۳۰ روز / ۵۰ مورد اخیر)</div>
            {loadingActs ? (
              <p className="text-sm text-[var(--ink-3)]">در حال بارگذاری...</p>
            ) : agentActivities.length === 0 ? (
              <p className="text-sm text-[var(--ink-3)]">فعالیتی ثبت نشده.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {agentActivities.map((a) => (
                  <div key={a.id} className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[var(--paper-2)] border border-[var(--line)] px-1.5 py-0.5 text-[11px]">
                        {ACTIVITY_TYPE_LABELS[a.type] ?? a.type}
                      </span>
                      <span className="text-[var(--ink-3)]">{new Date(a.createdAt).toLocaleDateString("fa-IR")}</span>
                      {a.customer && (
                        <Link href={`/customers/${a.customer.id}`} className="text-[var(--sea)] hover:underline">
                          {a.customer.name}
                        </Link>
                      )}
                    </div>
                    {a.description && <div className="mt-1">{a.description}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>کاربران سیستم</CardTitle></CardHeader>

          <form onSubmit={createUser} className="mb-5 grid gap-3 sm:grid-cols-5 items-end">
            <div>
              <Label htmlFor="f-name">نام</Label>
              <Input id="f-name" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="f-phone">شماره</Label>
              <PhoneInput id="f-phone" className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="f-password">رمز عبور (حداقل ۱۲ کاراکتر)</Label>
              <PasswordInput id="f-password" className="mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} />
            </div>
            <div>
              <Label htmlFor="f-role">نقش</Label>
              <Select id="f-role" className="mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="AGENT">مشاور</option>
                <option value="OWNER">مدیر</option>
              </Select>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "..." : "افزودن کاربر"}</Button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 text-right">نام</th>
                  <th className="text-right">شماره</th>
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{u.name}</td>
                    <td dir="ltr" className="text-right">{u.phone}</td>
                    <td className="text-center">{u.role === "OWNER" ? "مدیر" : "مشاور"}</td>
                    <td className="text-center">
                      <span className={u.active ? "text-emerald-600" : "text-zinc-400"}>
                        {u.active ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(u.id);
                            setEdit({ name: u.name, phone: u.phone, role: u.role, active: u.active, password: "" });
                          }}
                        >
                          ویرایش
                        </Button>
                        <Button type="button" size="sm" variant={u.active ? "danger" : "outline"} onClick={() => toggleActive(u)}>
                          {u.active ? "غیرفعال" : "فعال"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editId && (
            <form onSubmit={saveUser} className="mt-5 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-4 grid gap-3 sm:grid-cols-5 items-end">
              <div>
                <Label htmlFor="f-name-2">نام</Label>
                <Input id="f-name-2" className="mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="f-phone-2">شماره</Label>
                <PhoneInput id="f-phone-2" className="mt-1" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="f-password-2">رمز جدید (اختیاری)</Label>
                <PasswordInput id="f-password-2" className="mt-1" placeholder="خالی = بدون تغییر" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} minLength={12} />
              </div>
              <div>
                <Label htmlFor="f-role-2">نقش</Label>
                <Select id="f-role-2" className="mt-1" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  <option value="AGENT">مشاور</option>
                  <option value="OWNER">مدیر</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? "..." : "ذخیره"}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditId(null)}>انصراف</Button>
              </div>
            </form>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>خروجی داده (پشتیبان)</CardTitle></CardHeader>
          <p className="text-[13px] leading-6 text-[var(--ink-3)]">
            دانلود همهٔ مشتریان و فایل‌ها به‌صورت CSV — برای پشتیبان‌گیری یا انتقال به سیستم دیگر. فقط مدیر به این خروجی دسترسی دارد.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/admin/export?kind=customers" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--line)] bg-white px-4 py-2 text-[13.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)]">
              دانلود CSV مشتریان
            </a>
            <a href="/api/admin/export?kind=properties" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--line)] bg-white px-4 py-2 text-[13.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)]">
              دانلود CSV فایل‌ها
            </a>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>لاگ خطاهای سرور</CardTitle></CardHeader>
          {errorLogsUnavailable ? (
            <p className="text-[13px] text-[var(--ink-3)]">جدول لاگ هنوز در دیتابیس ساخته نشده است؛ خطاها فعلاً فقط در کنسول سرور ثبت می‌شوند.</p>
          ) : errorLogs.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-3)]">خطایی ثبت نشده است.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {errorLogs.map((l) => (
                <div key={l.id} className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[11px] font-bold text-red-700">{l.status}</span>
                    <span className="font-medium" dir="ltr">{l.method} {l.route}</span>
                    <span className="text-[var(--ink-3)]">{formatDateTime(l.createdAt)}</span>
                  </div>
                  <div className="mt-1 break-words text-[var(--ink-2)]">{l.message}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
