"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export default function AdminPage() {
  const [data, setData] = useState<{ teamStats: { id: string; name: string; role: string; overdue: number; weeklyActivity: number; monthlyActivity: number; deals: number }[] } | null>(null);
  useEffect(() => { fetch("/api/dashboard").then((r) => r.json()).then(setData); }, []);
  if (!data) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;
  return (
    <div>
      <Header title="مدیریت" subtitle="وضعیت تیم" />
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>جدول پیگیری عقب‌افتاده کل تیم</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-zinc-500"><th className="py-2 text-right">مشاور</th><th>عقب‌افتاده</th><th>هفتگی</th><th>ماهانه</th><th>معامله</th></tr></thead>
              <tbody>{(data.teamStats ?? []).map((s) => <tr key={s.id} className="border-b last:border-0"><td className="py-2 font-medium">{s.name} {s.role === "OWNER" ? "(مدیر)" : ""}</td><td className="text-center"><span className={s.overdue > 0 ? "text-red-600 font-bold" : ""}>{s.overdue}</span></td><td className="text-center">{s.weeklyActivity}</td><td className="text-center">{s.monthlyActivity}</td><td className="text-center font-medium">{s.deals}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
