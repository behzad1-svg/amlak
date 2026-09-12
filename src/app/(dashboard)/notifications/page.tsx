"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export default function NotificationsPage() {
  const [list, setList] = useState<{ id: string; message: string; type: string; priority: string; read: boolean; createdAt: string }[]>([]);
  function load() { fetch("/api/notifications").then((r) => r.json()).then((d) => setList(d.notifications ?? [])); }
  useEffect(() => { load(); }, []);
  async function markAll() { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) }); load(); }
  async function markOne(id: string) { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); load(); }
  return (
    <div>
      <Header title="اعلان‌ها" action={<Button variant="outline" onClick={markAll}>همه خوانده شد</Button>} />
      <div className="p-6 space-y-3 max-w-3xl">
        {list.length === 0 ? <p className="text-zinc-400">اعلانی ندارید</p> : list.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-60" : "border-amber-200 bg-amber-50/30"}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1"><div className="flex gap-2 mb-1"><Badge className={n.priority === "HIGH" ? "bg-red-100 text-red-700 border-red-200" : ""}>{n.priority}</Badge><Badge>{n.type}</Badge></div><p className="text-sm">{n.message}</p><p className="text-xs text-zinc-400 mt-1">{formatDate(n.createdAt)}</p></div>
              {!n.read && <Button size="sm" variant="outline" onClick={() => markOne(n.id)}>خواندم</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
