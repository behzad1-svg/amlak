"use client";

import React, { useState, useEffect } from "react";
import { Home, Users, Building2, Clock, Target, Search, Bell } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone: string;
  type: string;
  stage: string;
  temp: string;
  area: string | null;
  nextFollowUp: string | null;
};

const T = {
  bg: "#F7F4F3", bgSoft: "#FFFFFF", surface: "#FFFFFF", surfaceRaised: "#FBF3F2",
  border: "#EDE1DF", borderSoft: "#F1E6E4", accent: "#96222E", gold: "#B4842E",
  goldSoft: "rgba(180,132,46,0.12)", text: "#241614", textMuted: "#6E5C58", textFaint: "#A6928E",
  success: "#2E8354", successSoft: "rgba(46,131,84,0.10)", accentGlow: "rgba(150,34,46,0.10)", onAccent: "#FFFFFF"
};

const font = { fontFamily: "'Vazirmatn', 'IRANSans', 'Tahoma', system-ui, sans-serif" };

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, { color: string; bg: string }> = {
    muted: { color: T.textMuted, bg: "rgba(184,161,153,0.12)" },
    accent: { color: T.accent, bg: T.accentGlow },
    gold: { color: T.gold, bg: T.goldSoft },
    success: { color: T.success, bg: T.successSoft },
  };
  const s = tones[tone] || tones.muted;
  return <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: s.color, background: s.bg }}>{children}</span>;
}

function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-2xl border p-5 ${className}`} style={{ background: T.surface, borderColor: T.border, ...style }}>{children}</div>;
}

export default function SajCRM() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen" style={{ background: T.bg, color: T.text }}>در حال بارگذاری...</div>;
  }

  return (
    <div dir="rtl" style={{ ...font, background: T.bg, minHeight: "100vh", color: T.text }}>
      <div className="flex">
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-l h-screen sticky top-0" style={{ background: T.bgSoft, borderColor: T.borderSoft }}>
          <div className="px-5 pt-6 pb-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-lg" style={{ background: T.accent, color: T.onAccent }}>س</div>
            <div>
              <div className="font-extrabold text-sm" style={{ color: T.text }}>املاک ساج</div>
              <div className="text-[11px]" style={{ color: T.textFaint }}>بوشهر</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1 mt-2">
            {["today", "customers", "properties"].map((key) => (
              <button key={key} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold" style={{ color: T.gold, background: T.accentGlow }}>
                {key === "today" ? "امروز" : key === "customers" ? "مشتریان" : "املاک"}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b sticky top-0 z-10" style={{ background: "rgba(255,255,255,0.85)", borderColor: T.borderSoft }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl w-72" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <Search size={16} style={{ color: T.textFaint }} />
              <span className="text-sm" style={{ color: T.textFaint }}>جستجو...</span>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: T.goldSoft, color: T.gold }}>ب</div>
          </header>

          <main className="p-5 md:p-8 space-y-6">
            <div>
              <h1 className="text-xl font-extrabold" style={{ color: T.text }}>سلام بهزاد 👋</h1>
              <p className="text-sm mt-1" style={{ color: T.textMuted }}>تعداد کل مشتریان ثبت‌شده در دیتابیس: <strong>{customers.length}</strong> نفر</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <Target size={18} style={{ color: T.gold }} />
                <div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{customers.length}</div>
                <div className="text-xs mt-1" style={{ color: T.textMuted }}>کل مشتریان</div>
              </Card>
              <Card>
                <Clock size={18} style={{ color: T.accent }} />
                <div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{customers.filter(c => c.nextFollowUp === "امروز").length}</div>
                <div className="text-xs mt-1" style={{ color: T.textMuted }}>پیگیری امروز</div>
              </Card>
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} style={{ color: T.gold }} />
                <h3 className="font-bold text-base" style={{ color: T.text }}>لیست مشتریان (از دیتابیس)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: T.textFaint }} className="text-xs border-b">
                      <th className="text-right font-medium pb-2" style={{ borderColor: T.borderSoft }}>نام</th>
                      <th className="text-right font-medium pb-2">شماره تماس</th>
                      <th className="text-right font-medium pb-2">نوع</th>
                      <th className="text-right font-medium pb-2">منطقه</th>
                      <th className="text-right font-medium pb-2">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b" style={{ borderColor: T.borderSoft }}>
                        <td className="py-3 font-semibold" style={{ color: T.text }}>{c.name}</td>
                        <td className="py-3" style={{ color: T.textMuted }}>{c.phone}</td>
                        <td className="py-3" style={{ color: T.textMuted }}>{c.type}</td>
                        <td className="py-3" style={{ color: T.textMuted }}>{c.area || "—"}</td>
                        <td className="py-3"><Badge tone="gold">{c.temp}</Badge></td>
                      </tr>
                    ))}
                    {customers.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center" style={{ color: T.textFaint }}>هنوز مشتری‌ای ثبت نشده است. لطفاً به آدرس /api/seed بروید.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </main>
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');`}</style>
    </div>
  );
}