"use client";

import { useEffect, useState } from "react";
import { Bell, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { DateText } from "@/components/ui/DateText";
import { apiJson, errorMessage } from "@/lib/api";

type Note = {
  id: string;
  title: string;
  content: string;
  remindAt: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

/** ساعت HH:mm از یک تاریخ ISO (به وقت محلی مرورگر — مثل کارت جلسه). */
function timeFromIso(iso: string | null): string {
  if (!iso) return "12:00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "12:00";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ترکیب تاریخ شمسی انتخاب‌شده با ساعت — همان الگوی کارت جلسه. */
function combineDateTime(dateIso: string | null, time: string): string | null {
  if (!dateIso) return null;
  const [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
  const at = new Date(dateIso);
  at.setHours(Number.isNaN(hh) ? 12 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
  return at.toISOString();
}

export function NotesCard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [time, setTime] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDateIso, setEditDateIso] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("12:00");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadNotes() {
    try {
      const data = await apiJson<{ notes: Note[] }>("/api/notes");
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setLoadError("");
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiJson<{ notes: Note[] }>("/api/notes")
      .then((data) => {
        if (cancelled) return;
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        setLoadError("");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // یادآوری‌های سررسید بدون رفرش صفحه بالا بیایند
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const isDue = (n: Note) => !!n.remindAt && !n.done && new Date(n.remindAt).getTime() <= now;
  const dueCount = notes.filter(isDue).length;
  const sorted = [...notes].sort((a, b) => {
    const da = isDue(a) ? 0 : 1;
    const db = isDue(b) ? 0 : 1;
    if (da !== db) return da - db;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function resetForm() {
    setTitle("");
    setContent("");
    setDateIso(null);
    setTime("12:00");
  }

  async function addNote() {
    if (!content.trim()) {
      setFormError("متن یادداشت را بنویسید");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const created = await apiJson<Note>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), remindAt: combineDateTime(dateIso, time) }),
      });
      setNotes((prev) => [created, ...prev]);
      resetForm();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditContent(n.content);
    setEditDateIso(n.remindAt);
    setEditTime(timeFromIso(n.remindAt));
    setEditError("");
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editContent.trim()) {
      setEditError("متن یادداشت را بنویسید");
      return;
    }
    setEditError("");
    setEditSaving(true);
    try {
      const updated = await apiJson<Note>(`/api/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim(), remindAt: combineDateTime(editDateIso, editTime) }),
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingId(null);
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setEditSaving(false);
    }
  }

  async function patchNote(n: Note, patch: { done?: boolean; remindAt?: string | null }) {
    setBusyId(n.id);
    try {
      const updated = await apiJson<Note>(`/api/notes/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setNotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNote() {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      await apiJson(`/api/notes/${deleteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white">
            <StickyNote className="h-4 w-4" />
          </span>
          دفترچه یادداشت
        </CardTitle>
        {dueCount > 0 && (
          <span className="rounded-full border border-[#F1D9A8] bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--amber)]">
            {dueCount} یادآوری سررسید
          </span>
        )}
        <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{notes.length}</span>
      </CardHeader>

      <div className="space-y-3 px-4 pb-4">
        {/* فرم یادداشت تازه */}
        <div className="space-y-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان (اختیاری)" autoComplete="off" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="یادداشتت را بنویس…" rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>یادآوری — تاریخ</Label>
              <div className="mt-1">
                <JalaliDatePicker value={dateIso} onChange={setDateIso} placeholder="بدون یادآوری" />
              </div>
            </div>
            <div>
              <Label htmlFor="note-time">ساعت</Label>
              <Input id="note-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" dir="ltr" disabled={!dateIso} />
            </div>
          </div>
          {formError && <p className="text-[13px] text-red-700" role="alert">{formError}</p>}
          <Button onClick={() => void addNote()} disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "در حال ذخیره…" : "افزودن یادداشت"}
          </Button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-[13px] text-[var(--ink-3)]">در حال بارگذاری یادداشت‌ها…</p>
        ) : loadError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {loadError}{" "}
            <button type="button" className="font-bold underline" onClick={() => void loadNotes()}>
              تلاش دوباره
            </button>
          </div>
        ) : notes.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--ink-3)]">هنوز یادداشتی نداری — اولین یادداشتت را بالا بنویس.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((n) => {
              const due = isDue(n);
              const busy = busyId === n.id;
              return (
                <div
                  key={n.id}
                  className={
                    due
                      ? "rounded-[12px] border border-[#F1D9A8] bg-[var(--amber-soft)] px-3 py-2.5"
                      : "rounded-[12px] bg-[var(--paper-2)] px-3 py-2.5"
                  }
                >
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="عنوان (اختیاری)" autoComplete="off" />
                      <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>یادآوری — تاریخ</Label>
                          <div className="mt-1">
                            <JalaliDatePicker value={editDateIso} onChange={setEditDateIso} placeholder="بدون یادآوری" />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`note-time-${n.id}`}>ساعت</Label>
                          <Input id={`note-time-${n.id}`} type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="mt-1" dir="ltr" disabled={!editDateIso} />
                        </div>
                      </div>
                      {editError && <p className="text-[13px] text-red-700" role="alert">{editError}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit()} disabled={editSaving}>
                          {editSaving ? "در حال ذخیره…" : "ذخیره"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={editSaving}>
                          انصراف
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`min-w-0 text-[13.5px] font-bold ${n.done ? "opacity-60 line-through" : ""}`}>
                          {n.title.trim() || "بدون عنوان"}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {due && (
                            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">سررسید</span>
                          )}
                          {n.done && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">انجام شد</span>
                          )}
                        </span>
                      </div>
                      <p className={`mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[var(--ink-2)] ${n.done ? "opacity-60" : ""}`}>{n.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-3)]">
                        <span>
                          نوشته شده: <DateText value={n.createdAt} />
                        </span>
                        {n.remindAt && (
                          <span className="inline-flex items-center gap-1">
                            <Bell className="h-3.5 w-3.5" />
                            یادآوری: <DateText value={n.remindAt} withTime />
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {n.remindAt && !n.done && (
                          <button type="button" className="text-[12px] font-bold text-emerald-700 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void patchNote(n, { done: true })}>
                            انجام شد ✓
                          </button>
                        )}
                        {n.done && (
                          <button type="button" className="text-[12px] font-medium text-[var(--ink-2)] hover:underline disabled:opacity-50" disabled={busy} onClick={() => void patchNote(n, { done: false })}>
                            بازگردانی
                          </button>
                        )}
                        {n.remindAt && (
                          <button type="button" className="text-[12px] font-medium text-[var(--ink-2)] hover:underline disabled:opacity-50" disabled={busy} onClick={() => void patchNote(n, { remindAt: null })}>
                            پاک کردن یادآوری
                          </button>
                        )}
                        <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--ink-2)] hover:underline disabled:opacity-50" disabled={busy} onClick={() => startEdit(n)}>
                          <Pencil className="h-3.5 w-3.5" /> ویرایش
                        </button>
                        <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-red-700 hover:underline disabled:opacity-50" disabled={busy} onClick={() => setDeleteId(n.id)}>
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          title="حذف یادداشت؟"
          message="این یادداشت برای همیشه حذف می‌شود."
          confirmLabel="حذف"
          danger
          busy={deleteBusy}
          onConfirm={() => void deleteNote()}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </Card>
  );
}
