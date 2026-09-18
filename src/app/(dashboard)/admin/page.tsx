"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, PhoneInput, Select } from "@/components/ui/Input";

type TeamStat = {
  id: string;
  name: string;
  role: string;
  overdue: number;
  weeklyActivity: number;
  monthlyActivity: number;
  deals: number;
};

type AdminUser = {
  id: string;
  name: string;
  phone: string;
  role: "OWNER" | "AGENT";
  active: boolean;
};

type DashboardData = { teamStats: TeamStat[] | null };

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "AGENT" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", phone: "", role: "AGENT", active: true, password: "" });

  const flash = useCallback((ok: string, bad?: string) => {
    setMsg(ok);
    setErr(bad ?? "");
    setTimeout(() => { setMsg(""); setErr(""); }, 2800);
  }, []);

  const load = useCallback(async () => {
    const [dash, usersRes] = await Promise.all([
      fetch("/api/dashboard").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]);
    setData(dash);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return flash("", j.error || "خطا در ساخت کاربر");
    setForm({ name: "", phone: "", password: "", role: "AGENT" });
    flash("کاربر ساخته شد");
    load();
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      name: edit.name,
      phone: edit.phone,
      role: edit.role,
      active: edit.active,
    };
    if (edit.password) body.password = edit.password;
    const res = await fetch(`/api/users/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return flash("", j.error || "خطا در ذخیره");
    setEditId(null);
    setEdit({ name: "", phone: "", role: "AGENT", active: true, password: "" });
    flash("کاربر به‌روزرسانی شد");
    load();
  }

  async function toggleActive(u: AdminUser) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return flash("", j.error || "خطا");
    flash(u.active ? "کاربر غیرفعال شد" : "کاربر فعال شد");
    load();
  }

  if (!data) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;

  return (
    <div>
      <Header title="مدیریت" subtitle="وضعیت تیم و کاربران" />
      <div className="p-6 space-y-6 max-w-[1120px]">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <Card>
          <CardHeader><CardTitle>جدول پیگیری عقب‌افتاده کل تیم</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 text-right">مشاور</th>
                  <th>عقب‌افتاده</th>
                  <th>هفتگی</th>
                  <th>ماهانه</th>
                  <th>معامله</th>
                </tr>
              </thead>
              <tbody>
                {(data.teamStats ?? []).map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.name} {s.role === "OWNER" ? "(مدیر)" : ""}</td>
                    <td className="text-center">
                      <span className={s.overdue > 0 ? "text-red-600 font-bold" : ""}>{s.overdue}</span>
                    </td>
                    <td className="text-center">{s.weeklyActivity}</td>
                    <td className="text-center">{s.monthlyActivity}</td>
                    <td className="text-center font-medium">{s.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>کاربران سیستم</CardTitle></CardHeader>

          <form onSubmit={createUser} className="mb-5 grid gap-3 sm:grid-cols-5 items-end">
            <div>
              <Label>نام</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>شماره</Label>
              <PhoneInput className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <Label>رمز عبور</Label>
              <Input type="password" className="mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </div>
            <div>
              <Label>نقش</Label>
              <Select className="mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
                <Label>نام</Label>
                <Input className="mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </div>
              <div>
                <Label>شماره</Label>
                <PhoneInput className="mt-1" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required />
              </div>
              <div>
                <Label>رمز جدید (اختیاری)</Label>
                <Input type="password" className="mt-1" placeholder="خالی = بدون تغییر" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} minLength={8} />
              </div>
              <div>
                <Label>نقش</Label>
                <Select className="mt-1" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
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
      </div>
    </div>
  );
}
