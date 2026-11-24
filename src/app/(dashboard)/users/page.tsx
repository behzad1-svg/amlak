"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, PasswordInput, PhoneInput, Select } from "@/components/ui/Input";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { toEnDigits, toFaDigits } from "@/lib/utils";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";

type ManagedUser = { id: string; name: string; phone: string; role: string; active: boolean; createdAt: string; permissions?: Record<string, boolean>; isContractManager?: boolean };

export default function UsersPage() {
  const { role, loading: roleLoading } = useRole();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [newUser, setNewUser] = useState({ name: "", phone: "", password: "", role: "AGENT" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editValue, setEditValue] = useState({ name: "", phone: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<{ user: ManagedUser; nextRole: string } | null>(null);
  const [pendingToggle, setPendingToggle] = useState<ManagedUser | null>(null);
  /** جستجوی کاربر با نام یا شماره تماس */
  const [query, setQuery] = useState("");

  // پیام موفقیت خودبه‌خود پاک می‌شود؛ پیام خطا تا اقدام بعدی می‌ماند
  function flash(ok: string, bad?: string) {
    setMsg(ok);
    setErr(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 2800);
  }

  async function loadUsers() {
    try {
      const list = await apiJson<ManagedUser[]>("/api/users");
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }

  useEffect(() => {
    void (async () => {
      if (roleLoading) return;
      if (role !== "OWNER") { setLoading(false); return; }
      setLoading(true);
      await loadUsers();
      setLoading(false);
    })();
  }, [role, roleLoading]);

  async function patchUser(id: string, body: Record<string, unknown>, okMsg: string) {
    setUserBusy(true);
    try {
      await apiFetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      flash(okMsg);
      await loadUsers();
    } catch (e) {
      flash("", errorMessage(e));
    } finally {
      setUserBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (newUser.password.length < 12 || !/[A-Za-z]/.test(newUser.password) || !/[0-9]/.test(newUser.password)) {
      flash("", "رمز باید حداقل ۱۲ کاراکتر و شامل حرف لاتین و رقم باشد");
      return;
    }
    setCreatingUser(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newUser, phone: toEnDigits(newUser.phone) }),
      });
      setNewUser({ name: "", phone: "", password: "", role: "AGENT" });
      flash("کاربر ساخته شد");
      await loadUsers();
    } catch (e2) {
      flash("", errorMessage(e2));
    } finally {
      setCreatingUser(false);
    }
  }

  async function resetUserPassword(u: ManagedUser) {
    if (pwValue.length < 12 || !/[A-Za-z]/.test(pwValue) || !/[0-9]/.test(pwValue)) {
      flash("", "رمز تازه باید حداقل ۱۲ کاراکتر و شامل حرف لاتین و رقم باشد");
      return;
    }
    await patchUser(u.id, { password: pwValue }, `رمز ${u.name} ریست شد — جلسه‌های او بسته شد`);
    setPwFor(null);
    setPwValue("");
  }

  // کاربرانِ دیده‌شده با جستجو — نام یا شماره تماس (ارقام فارسی هم به لاتین برگردانده می‌شوند)
  const q = query.trim();
  const qDigits = toEnDigits(q).replace(/\D/g, "");
  const visibleUsers = q
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(q.toLowerCase()) ||
          (qDigits !== "" && toEnDigits(u.phone).replace(/\D/g, "").includes(qDigits))
      )
    : users;

  if (loading || roleLoading) return <PageSkeleton rows={3} />;
  if (loadError) return <PageError message={loadError} onRetry={() => { setLoadError(null); setLoading(true); void loadUsers().finally(() => setLoading(false)); }} />;
  if (role !== "OWNER") {
    return (
      <div>
        <Header title="کاربران" subtitle="مدیریت کاربران سیستم" />
        <div className="p-4 sm:p-6 max-w-2xl">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">این صفحه فقط برای مدیر است.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="کاربران" subtitle="ساختن کاربر، تغییر نقش و دسترسی، فعال/غیرفعال و ریست رمز" />
      <div className="p-4 sm:p-6 max-w-[1200px] space-y-6">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}
        <Card>
          <h3 className="font-semibold mb-3">مدیریت کاربران</h3>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی نام یا شماره تماس…"
              className="max-w-xs flex-1"
              aria-label="جستجوی کاربر"
            />
            <span className="text-[12px] text-[var(--ink-3)]">
              {q
                ? `${toFaDigits(String(visibleUsers.length))} نفر از ${toFaDigits(String(users.length))} نفر`
                : `${toFaDigits(String(users.length))} نفر`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleUsers.map((u) => (
              <div key={u.id} className="rounded-[12px] border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[13px]">{u.name}</span>
                  <span dir="ltr" className="text-[12px] text-[var(--ink-3)]">{u.phone}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[11px]">{u.role === "OWNER" ? "مدیر" : "مشاور"}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {u.active ? "فعال" : "غیرفعال"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    value={u.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      if (nextRole === u.role) return;
                      setPendingRole({ user: u, nextRole });
                    }}
                    disabled={userBusy}
                    className="w-28 text-[13px]"
                    aria-label="نقش کاربر"
                  >
                    <option value="AGENT">مشاور</option>
                    <option value="OWNER">مدیر</option>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={userBusy}
                    onClick={() => {
                      if (u.active) { setPendingToggle(u); return; }
                      void patchUser(u.id, { active: !u.active }, u.active ? "کاربر غیرفعال شد" : "کاربر فعال شد");
                    }}
                  >
                    {u.active ? "غیرفعال کردن" : "فعال کردن"}
                  </Button>
                  <Button variant="outline" disabled={userBusy} onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPwValue(""); }}>
                    ریست رمز
                  </Button>
                  <Button
                    variant="outline"
                    disabled={userBusy}
                    onClick={() => {
                      if (editFor === u.id) { setEditFor(null); return; }
                      setEditFor(u.id);
                      setEditValue({ name: u.name, phone: u.phone });
                    }}
                  >
                    ویرایش
                  </Button>
                </div>
                <div className="mt-2">
                  <div className="text-[12px] font-bold text-[var(--ink-3)] mb-1">دسترسی‌ها</div>
                  <div className="flex flex-wrap gap-3">
                    {PERMISSIONS.map((perm) => {
                      const checked = hasPermission({ role: u.role, permissions: u.permissions }, perm.key);
                      return (
                        <label key={perm.key} className="flex items-center gap-1 text-[13px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={userBusy || u.role === "OWNER"}
                            onChange={(e) => void patchUser(u.id, { permissions: { ...(u.permissions ?? {}), [perm.key]: e.target.checked } }, "دسترسی به‌روز شد")}
                          />
                          {perm.label}
                        </label>
                      );
                    })}
                  </div>
                  {u.role === "OWNER" && <p className="text-[11px] text-zinc-400 mt-1">مدیر همه دسترسی‌ها را دارد.</p>}
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-1 text-[13px]">
                    <input
                      type="checkbox"
                      checked={u.isContractManager ?? false}
                      disabled={userBusy}
                      onChange={(e) => void patchUser(u.id, { isContractManager: e.target.checked }, "مدیر قرارداد به‌روز شد")}
                    />
                    مدیر قرارداد
                  </label>
                  <p className="text-[11px] text-zinc-400 mt-1">مدیر قرارداد فقط در کشوی مدیر قرارداد کارت جلسه دیده می‌شود و اعلان کارت جلسه را می‌گیرد؛ دسترسی دیگری نمی‌دهد.</p>
                </div>
                {pwFor === u.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <PasswordInput
                      value={pwValue}
                      onChange={(e) => setPwValue(e.target.value)}
                      placeholder="رمز تازه (حداقل ۱۲ کاراکتر، حرف و رقم)"
                      className="flex-1"
                    />
                    <Button disabled={userBusy} onClick={() => void resetUserPassword(u)} className="w-full sm:w-auto">
                      ثبت رمز تازه
                    </Button>
                  </div>
                )}
                {editFor === u.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input value={editValue.name} onChange={(e) => setEditValue({ ...editValue, name: e.target.value })} placeholder="نام" className="flex-1" />
                    <PhoneInput value={editValue.phone} onChange={(e) => setEditValue({ ...editValue, phone: e.target.value })} placeholder="شماره تماس" className="flex-1" />
                    <Button
                      disabled={userBusy}
                      onClick={async () => {
                        await patchUser(u.id, { name: editValue.name.trim(), phone: toEnDigits(editValue.phone.trim()) }, "مشخصات به‌روز شد");
                        setEditFor(null);
                      }}
                      className="w-full sm:w-auto"
                    >
                      ذخیره
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-zinc-400">کاربری نیست.</p>}
            {users.length > 0 && visibleUsers.length === 0 && <p className="text-sm text-zinc-400">کاربری با این نام یا شماره پیدا نشد.</p>}
          </div>
          <form onSubmit={createUser} className="mt-4 border-t border-[var(--line)] pt-3 space-y-2">
            <div className="text-[13px] font-bold">کاربر تازه</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="نام و نام خانوادگی" required />
              <PhoneInput value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} placeholder="شماره تماس (مثلا 09170000004)" required />
              <PasswordInput value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="رمز (حداقل ۱۲ کاراکتر، حرف و رقم)" required minLength={12} />
              <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} aria-label="نقش کاربر تازه">
                <option value="AGENT">مشاور</option>
                <option value="OWNER">مدیر</option>
              </Select>
            </div>
            <Button type="submit" disabled={creatingUser}>{creatingUser ? "..." : "ساختن کاربر"}</Button>
            {err && <p className="text-[13px] text-red-700" role="alert">{err}</p>}
          </form>
          <p className="mt-2 text-[12px] text-[var(--ink-3)]">
            حذف کاربر در سیستم نیست؛ برای قطع دسترسی، کاربر را غیرفعال کنید. با ریست رمز یا تغییر نقش، جلسه‌های آن کاربر بسته می‌شود.
          </p>
        </Card>
      </div>
      {pendingRole && (
        <ConfirmDialog
          title="تغییر نقش"
          message={
            pendingRole.nextRole === "OWNER"
              ? `نقش ${pendingRole.user.name} به «مدیر» تغییر کند؟ این یعنی دسترسی کامل به همهٔ بخش\u200Cهای مدیر.`
              : `نقش ${pendingRole.user.name} به «مشاور» تغییر کند؟ دسترسی\u200Cهای مدیر از او گرفته می\u200Cشود.`
          }
          confirmLabel="تغییر نقش"
          danger={pendingRole.nextRole === "OWNER"}
          onConfirm={() => {
            const pr = pendingRole;
            setPendingRole(null);
            if (pr) void patchUser(pr.user.id, { role: pr.nextRole }, "نقش تغییر کرد");
          }}
          onCancel={() => setPendingRole(null)}
        />
      )}
      {pendingToggle && (
        <ConfirmDialog
          title="قطع دسترسی"
          message={`دسترسی ${pendingToggle.name} قطع شود؟ دیگر نمی\u200Cتواند وارد شود.`}
          confirmLabel="قطع دسترسی"
          danger
          onConfirm={() => {
            const u = pendingToggle;
            setPendingToggle(null);
            void patchUser(u.id, { active: false }, "کاربر غیرفعال شد");
          }}
          onCancel={() => setPendingToggle(null)}
        />
      )}
    </div>
  );
}
