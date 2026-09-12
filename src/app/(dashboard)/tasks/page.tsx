"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

export default function TasksPage() {
  const [list, setList] = useState<{ id: string; title: string; done: boolean; dueAt: string | null; priority: number }[]>([]);
  const [title, setTitle] = useState("");
  function load() { fetch("/api/tasks").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!title.trim()) return;
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    setTitle(""); load();
  }
  async function toggle(t: typeof list[0]) { await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !t.done }) }); load(); }
  async function remove(id: string) { await fetch(`/api/tasks/${id}`, { method: "DELETE" }); load(); }
  return (
    <div>
      <Header title="وظایف" />
      <div className="p-6 max-w-2xl space-y-4">
        <div className="flex gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان وظیفه..." onKeyDown={(e) => e.key === "Enter" && add()} /><Button onClick={add}>افزودن</Button></div>
        <div className="space-y-2">
          {list.map((t) => (
            <Card key={t.id} className={`flex items-center justify-between ${t.done ? "opacity-50" : ""}`}>
              <label className="flex items-center gap-3 flex-1 cursor-pointer"><input type="checkbox" checked={t.done} onChange={() => toggle(t)} /><span className={t.done ? "line-through" : ""}>{t.title}</span>{t.dueAt ? <span className="text-xs text-zinc-400">{formatDate(t.dueAt)}</span> : null}</label>
              <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>حذف</Button>
            </Card>
          ))}
          {list.length === 0 && <p className="text-sm text-zinc-400">وظیفه‌ای ندارید</p>}
        </div>
      </div>
    </div>
  );
}
