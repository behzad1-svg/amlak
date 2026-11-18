// Phonebook: ONE directory — phonebook contacts + customers together.
// A customer shows with the مالک/خریدار tag, read live (never copied).
// An advisor sees only the numbers they registered themselves, same rule
// as files/customers; OWNER sees all. Fast lookup by name or number,
// groups, VIP/pin, click-to-call.
"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Label, PhoneInput, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useApiList } from "@/hooks/useApiList";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { PHONEBOOK_GROUP_LABELS, PHONEBOOK_GROUP_OPTIONS } from "@/lib/constants";
import { cn, toFaDigits } from "@/lib/utils";

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  group: string;
  tags: string[];
  notes: string | null;
  isVip: boolean;
  isPinned: boolean;
  isPrivate: boolean;
  owner: { id: string; name: string } | null;
  createdAt: string;
  source: "phonebook" | "customer";
  customerId: string | null;
};

type FormState = {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  group: string;
  tagsText: string;
  notes: string;
  isVip: boolean;
  isPinned: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  phone2: "",
  email: "",
  group: "OTHER",
  tagsText: "",
  notes: "",
  isVip: false,
  isPinned: false,
};

const GROUP_FILTERS = [{ value: "all", label: "همه" }, ...PHONEBOOK_GROUP_OPTIONS];

export default function PhonebookPage() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [actionError, setActionError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const fetcher = useCallback(
    async (page: number) => {
      const q = new URLSearchParams({ page: String(page), limit: "100" });
      if (search.trim()) q.set("search", search.trim());
      if (groupFilter !== "all") q.set("group", groupFilter);
      if (vipOnly) q.set("vip", "true");
      if (pinnedOnly) q.set("pinned", "true");
      const d = await apiJson<{ contacts: ContactRow[]; total: number }>(`/api/phonebook?${q.toString()}`);
      return { items: d.contacts ?? [], total: d.total ?? 0 };
    },
    [search, groupFilter, vipOnly, pinnedOnly],
  );

  const { items, total, loading, loadingMore, error, hasMore, loadMore, retry } = useApiList<ContactRow>({
    fetcher,
    debounceMs: 250,
    deps: [search, groupFilter, vipOnly, pinnedOnly],
  });

  function openForm(contact?: ContactRow) {
    setFormError("");
    if (contact) {
      setEditing(contact);
      setForm({
        name: contact.name,
        phone: contact.phone,
        phone2: contact.phone2 ?? "",
        email: contact.email ?? "",
        group: contact.group,
        tagsText: contact.tags.join("، "),
        notes: contact.notes ?? "",
        isVip: contact.isVip,
        isPinned: contact.isPinned,
      });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  function upd<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveForm() {
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        phone2: form.phone2.trim() || null,
        email: form.email.trim() || null,
        group: form.group,
        tags: form.tagsText
          .split(/[،,]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        notes: form.notes.trim() || null,
        isVip: form.isVip,
        isPinned: form.isPinned,
      };
      if (editing) {
        await apiFetch(`/api/phonebook/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/phonebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      retry();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleFlag(c: ContactRow, key: "isVip" | "isPinned") {
    setActionError("");
    try {
      await apiFetch(`/api/phonebook/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !c[key] }),
      });
      retry();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/phonebook/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      retry();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setDeletingBusy(false);
    }
  }

  // Skeleton only on first load: on filter/search changes the old list stays
  // visible until the new result arrives, so the page does not jump.
  if (loading && total === null) return <PageSkeleton rows={4} />;
  if (error) return <PageError message={error} onRetry={retry} />;

  return (
    <div>
      <Header title="دفترچه تلفن" action={<Button onClick={() => openForm()}>ثبت مخاطب</Button>} />
      <div className="p-4 sm:p-6 space-y-3 max-w-3xl">
        {actionError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو با نام یا شماره"
          aria-label="جستجو در دفترچه تلفن"
        />
        <div className="flex flex-wrap gap-2">
          {GROUP_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={groupFilter === f.value ? "primary" : "outline"}
              onClick={() => setGroupFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Button size="sm" variant={vipOnly ? "primary" : "outline"} onClick={() => setVipOnly((v) => !v)}>
            فقط مهم ها
          </Button>
          <Button size="sm" variant={pinnedOnly ? "primary" : "outline"} onClick={() => setPinnedOnly((v) => !v)}>
            فقط پین شده ها
          </Button>
        </div>
        <p className="text-[12px] text-[var(--ink-3)]">
          نمایش {toFaDigits(String(items.length))} از {toFaDigits(String(total ?? 0))} مخاطب
          {loading && total !== null ? " — در حال بارگذاری..." : ""}
        </p>
        {items.length === 0 ? (
          <p className="text-zinc-400">مخاطبی ندارید</p>
        ) : (
          items.map((c) => (
            <Card key={c.id} className={cn(c.isPinned && "border-amber-200 bg-amber-50/30")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.customerId ? (
                      <Link href={`/customers/${c.customerId}`} className="text-[14px] font-bold underline underline-offset-2">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-bold">{c.name}</span>
                    )}
                    <Badge>{PHONEBOOK_GROUP_LABELS[c.group] ?? c.group}</Badge>
                    {c.customerId && <Badge className="bg-[#EFF4FF] text-[#2F5D8A] border-[#A8C4EA]">مشتری</Badge>}
                    {c.isVip && <Badge className="bg-red-100 text-red-700 border-red-200">مهم</Badge>}
                    {c.isPinned && <Badge className="bg-amber-100 text-amber-800 border-amber-200">پین شده</Badge>}
                    {c.isPrivate && <Badge>خصوصی</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    <a href={`tel:${c.phone}`} className="font-mono text-[var(--ink)] underline underline-offset-2" dir="ltr">
                      {toFaDigits(c.phone)}
                    </a>
                    {c.phone2 && (
                      <a href={`tel:${c.phone2}`} className="font-mono text-[var(--ink-2)] underline underline-offset-2" dir="ltr">
                        {toFaDigits(c.phone2)}
                      </a>
                    )}
                    {c.email && <span className="text-[var(--ink-2)] break-all" dir="ltr">{c.email}</span>}
                  </div>
                  {c.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-[var(--paper-2)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.notes && <p className="mt-1 text-[13px] leading-6 text-[var(--ink-2)] break-words">{c.notes}</p>}
                  {c.owner && <p className="mt-1 text-[11px] text-[var(--ink-3)]">ثبت کننده: {c.owner.name}</p>}
                </div>
                {c.source === "phonebook" && (
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggleFlag(c, "isPinned")}>
                      {c.isPinned ? "برداشتن پین" : "پین"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleFlag(c, "isVip")}>
                      {c.isVip ? "برداشتن مهم" : "مهم"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openForm(c)}>
                      ویرایش
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                      حذف
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
        {hasMore && (
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "..." : "بارگذاری بیشتر"}
          </Button>
        )}
      </div>

      {formOpen && (
        <Modal onClose={closeForm} ariaLabel={editing ? "ویرایش مخاطب" : "ثبت مخاطب"}>
          <h3 className="text-[15px] font-extrabold">{editing ? "ویرایش مخاطب" : "ثبت مخاطب"}</h3>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveForm();
            }}
          >
            {formError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {formError}
              </div>
            )}
            <div>
              <Label htmlFor="pb-name">نام *</Label>
              <Input id="pb-name" value={form.name} onChange={(e) => upd("name", e.target.value)} required maxLength={120} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pb-phone">شماره تماس *</Label>
              <PhoneInput id="pb-phone" value={form.phone} onChange={(e) => upd("phone", e.target.value)} required placeholder="09171234567" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pb-phone2">شماره دوم</Label>
              <PhoneInput id="pb-phone2" value={form.phone2} onChange={(e) => upd("phone2", e.target.value)} placeholder="09171234567" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pb-email">ایمیل</Label>
              <Input id="pb-email" type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} dir="ltr" className="mt-1 text-left" />
            </div>
            <div>
              <Label htmlFor="pb-group">گروه</Label>
              <Select id="pb-group" value={form.group} onChange={(e) => upd("group", e.target.value)} className="mt-1">
                {PHONEBOOK_GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pb-tags">برچسب ها (با ویرگول جدا کنید)</Label>
              <Input id="pb-tags" value={form.tagsText} onChange={(e) => upd("tagsText", e.target.value)} placeholder="مثال: بوشهر، آپارتمان" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pb-notes">یادداشت</Label>
              <Textarea id="pb-notes" value={form.notes} onChange={(e) => upd("notes", e.target.value)} rows={3} className="mt-1" />
            </div>
            <div className="flex flex-wrap gap-4 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isVip} onChange={(e) => upd("isVip", e.target.checked)} />
                مشتری مهم
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isPinned} onChange={(e) => upd("isPinned", e.target.checked)} />
                پین شده
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "..." : editing ? "ذخیره تغییرات" : "ثبت مخاطب"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm} disabled={saving}>
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف مخاطب"
          message={`مخاطب «${deleting.name}» حذف شود؟`}
          confirmLabel="حذف"
          danger
          busy={deletingBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
