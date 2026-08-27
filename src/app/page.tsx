"use client";

import React, { useState } from "react";
import {
  Home, Users, Building2, CalendarClock, Handshake, Inbox as InboxIcon,
  FileText, BarChart3, Bell, Settings, Search, Plus, Phone, MapPin,
  Clock, ChevronLeft, TrendingUp, Target, X, Mail, Archive
} from "lucide-react";

const T = {
  bg: "#F7F4F3", bgSoft: "#FFFFFF", surface: "#FFFFFF", surfaceRaised: "#FBF3F2",
  border: "#EDE1DF", borderSoft: "#F1E6E4", accent: "#96222E", accentSoft: "#7A1B26",
  accentGlow: "rgba(150,34,46,0.10)", gold: "#B4842E", goldSoft: "rgba(180,132,46,0.12)",
  text: "#241614", textMuted: "#6E5C58", textFaint: "#A6928E", success: "#2E8354",
  successSoft: "rgba(46,131,84,0.10)", warn: "#B4842E", onAccent: "#FFFFFF",
};

const font = { fontFamily: "'Vazirmatn', 'IRANSans', 'Tahoma', system-ui, sans-serif" };
const woodgrain = { backgroundImage: `repeating-linear-gradient(100deg, rgba(180,132,46,0.06) 0px, rgba(180,132,46,0.06) 1px, transparent 1px, transparent 14px)` };

const NAV = [
  { key: "today", label: "امروز", icon: Home },
  { key: "customers", label: "مشتریان", icon: Users },
  { key: "properties", label: "املاک", icon: Building2 },
  { key: "viewings", label: "بازدیدها", icon: CalendarClock },
  { key: "deals", label: "معاملات", icon: Handshake },
  { key: "inbox", label: "پیام‌ها", icon: InboxIcon },
  { key: "documents", label: "اسناد", icon: FileText },
  { key: "analytics", label: "گزارش‌ها", icon: BarChart3 },
];

const STAGES = [
  { key: "NEW", label: "تازه‌وارد" },
  { key: "INITIAL_CONTACT", label: "تماس اولیه" },
  { key: "QUALIFIED", label: "نیاز سنجی شده" },
  { key: "VIEWING", label: "بازدید" },
  { key: "CONTRACT", label: "قرارداد" },
];

const initialCustomers = [
  { id: 1, name: "محمد رضایی", phone: "09121234567", email: "m.rezaei@email.com", type: "خریدار", stage: "INITIAL_CONTACT", temp: "داغ", area: "سعادت‌آباد", budget: "۳ تا ۴ میلیارد", src: "سایت", nextFollowUp: "امروز" },
  { id: 2, name: "سعید رحیمی", phone: "09382201190", email: "", type: "خریدار", stage: "INITIAL_CONTACT", temp: "گرم", area: "شهرک صنعتی", budget: " میلیارد", src: "اینستاگرام", nextFollowUp: "فردا" },
  { id: 3, name: "فرهاد یوسفی", phone: "09170042231", email: "", type: "مستاجر", stage: "INITIAL_CONTACT", temp: "سرد", area: "کوی زیتون", budget: "ماهی ۱ میلیون", src: "دیوار", nextFollowUp: "۲ روز بعد" },
  { id: 4, name: "رضا احمدی", phone: "09128871120", email: "", type: "خریدار", stage: "QUALIFIED", temp: "گرم", area: "شهرک غرب", budget: " میلیارد", src: "معرفی مشتری", nextFollowUp: "عقب‌افتاده" },
  { id: 5, name: "مریم حسینی", phone: "09354418820", email: "", type: "مستاجر", stage: "QUALIFIED", temp: "گرم", area: "بندرگاه", budget: "ماهی ۸ میلیون", src: "تماس مستقیم", nextFollowUp: "امروز" },
  { id: 6, name: "احسان پایدار", phone: "09125503391", email: "", type: "خریدار", stage: "VIEWING", temp: "داغ", area: "کوی زیتون", budget: "۴ میلیارد", src: "اینستاگرام", nextFollowUp: "امروز" },
];

const matches = [
  { pct: 96, file: "فایل #۵۲۱", desc: "مناسب برای محمد رضایی", ago: "۲ ساعت پیش" },
  { pct: 92, file: "فایل #۳۴۱۲", desc: "مناسب برای علی احمدی", ago: "۳ ساعت پیش" },
  { pct: 89, file: "فایل #۲۲۱۰", desc: "مناسب برای سارا کریمی", ago: "۵ ساعت پیش" },
];

const todayPriorities = [
  { time: "۰۹:۳", tag: "تماس", tagTone: "accent", name: "محمد رضایی", desc: "درباره فایل #۴۵۲۱ صحبت شد" },
  { time: "۱۱:۰۰", tag: "پیگیری", tagTone: "gold", name: "مالک فایل #۴۵۲۱", desc: "پیگیری کاهش قیمت" },
  { time: "۵:۰۰", tag: "بازدید", tagTone: "success", name: "بازدید فایل #۲۲۰", desc: "همراه: آقای احمدی" },
];

const properties = [
  { title: "آپارتمان ۲۰ متری، کوی زیتون", type: "آپارتمان", dealType: "SALE", price: "۳.۲ میلیارد", status: "فعال", beds: 3, match: 4 },
  { title: "ویلایی حیاط‌دار، بندرگاه", type: "ویلا", dealType: "SALE", price: "۵.۸ میلیارد", status: "رزرو شده", beds: 4, match: 2 },
  { title: "اداری ۶۰ متری، خیابان معلم", type: "اداری", dealType: "RENT", price: "رهن ۲۰۰م / اجاره ۹م", status: "فعال", beds: 0, match: 6 },
];

function Badge({ children, tone = "muted" }) {
  const tones = {
    muted: { color: T.textMuted, bg: "rgba(184,161,153,0.12)" },
    accent: { color: T.accent, bg: T.accentGlow },
    gold: { color: T.gold, bg: T.goldSoft },
    success: { color: T.success, bg: T.successSoft },
  };
  const s = tones[tone];
  return <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: s.color, background: s.bg }}>{children}</span>;
}

function Card({ children, className = "", style = {} }) {
  return <div className={`rounded-2xl border p-5 ${className}`} style={{ background: T.surface, borderColor: T.border, ...style }}>{children}</div>;
}

function SectionTitle({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: T.gold }} />
        <h3 className="font-bold text-base" style={{ color: T.text }}>{title}</h3>
      </div>
      {action}
    </div>
  );
}

export default function SajCRM() {
  const [active, setActive] = useState("today");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [propertyFilter, setPropertyFilter] = useState("ALL");
  const [customers, setCustomers] = useState(initialCustomers);
  const [dragId, setDragId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

  const moveCustomerToStage = (id, stage) => {
    if (stage === "LOST") {
      const reason = window.prompt("دلیل اتمام کار با این مشتری چیست؟ (مثلاً: منصرف شد / قیمت را قبول نکرد)");
      if (!reason) return;
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, stage, lostReason: reason } : c)));
      return;
    }
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
  };

  return (
    <div dir="rtl" style={{ ...font, background: T.bg, minHeight: "100vh", color: T.text }}>
      <div className="flex">
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-l h-screen sticky top-0" style={{ background: T.bgSoft, borderColor: T.borderSoft, ...woodgrain }}>
          <div className="px-5 pt-6 pb-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-lg" style={{ background: T.accent, color: T.onAccent }}>س</div>
            <div>
              <div className="font-extrabold text-sm" style={{ color: T.text }}>املاک ساج</div>
              <div className="text-[11px]" style={{ color: T.textFaint }}>بوشهر</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1 mt-2">
            {NAV.map((n) => {
              const Icon = n.icon;
              const isActive = active === n.key;
              return (
                <button key={n.key} onClick={() => setActive(n.key)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors" style={{ background: isActive ? T.accentGlow : "transparent", color: isActive ? T.gold : T.textMuted, fontWeight: isActive ? 700 : 500 }}>
                  <Icon size={17} /> {n.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t" style={{ borderColor: T.borderSoft }}>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm" style={{ color: T.textMuted }}><Settings size={17} /> تنظیمات</button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b sticky top-0 z-10" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(6px)", borderColor: T.borderSoft }}>
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl w-72" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <Search size={16} style={{ color: T.textFaint }} />
              <span className="text-sm" style={{ color: T.textFaint }}>جستجوی مشتری، ملک، لید...</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative p-2 rounded-lg" style={{ background: T.surface }}><Bell size={17} style={{ color: T.textMuted }} /><span className="absolute -top-1 -left-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: T.accent, color: T.onAccent }}>۳</span></button>
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: T.goldSoft, color: T.gold }}>ب</div>
            </div>
          </header>

          <main className="p-5 md:p-8 space-y-6">
            {active === "today" && (
              <>
                <div>
                  <h1 className="text-xl font-extrabold" style={{ color: T.text }}>سلام بهزاد 👋</h1>
                  <p className="text-sm mt-1" style={{ color: T.textMuted }}>امروز شنبه، ۲۵ مرداد ۱۴۰۳ — این‌هفته ۳ بازدید،  پیگیری و ۵ Match جدید داری.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "عقب‌افتاده", value: "۴", icon: Clock, tone: "accent" },
                    { label: "پیگیری امروز", value: "۷", icon: CalendarClock, tone: "gold" },
                    { label: "بازدید", value: "۲", icon: Users, tone: "success" },
                    { label: "Match جدید", value: "۵", icon: Target, tone: "muted" },
                  ].map((k) => {
                    const Icon = k.icon;
                    const colorMap = { accent: T.accent, gold: T.gold, success: T.success, muted: T.textMuted };
                    return (
                      <Card key={k.label}>
                        <Icon size={18} style={{ color: colorMap[k.tone] }} />
                        <div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{k.value}</div>
                        <div className="text-xs mt-1" style={{ color: T.textMuted }}>{k.label}</div>
                      </Card>
                    );
                  })}
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card>
                    <SectionTitle icon={CalendarClock} title="اولویت‌های امروز" />
                    <div className="space-y-3">
                      {todayPriorities.map((v, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: T.surfaceRaised }}>
                          <div className="flex items-center gap-3">
                            <Badge tone={v.tagTone}>{v.tag}</Badge>
                            <div>
                              <div className="text-sm font-bold" style={{ color: T.text }}>{v.time} — {v.name}</div>
                              <div className="text-xs mt-0.5" style={{ color: T.textMuted }}>{v.desc}</div>
                            </div>
                          </div>
                          <ChevronLeft size={16} style={{ color: T.textFaint }} />
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card>
                    <SectionTitle icon={Target} title="Matchهای جدید" />
                    <div className="space-y-3">
                      {matches.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.surfaceRaised }}>
                          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0" style={{ border: `2px solid ${T.success}`, color: T.success }}>{m.pct}%</div>
                          <div className="flex-1">
                            <div className="text-sm font-bold" style={{ color: T.text }}>{m.file}</div>
                            <div className="text-xs" style={{ color: T.textMuted }}>{m.desc}</div>
                          </div>
                          <span className="text-[11px]" style={{ color: T.textFaint }}>{m.ago}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
                <Card>
                  <SectionTitle icon={Users} title="پیگیری‌های نزدیک" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: T.textFaint }} className="text-xs border-b">
                          <th className="text-right font-medium pb-2" style={{ borderColor: T.borderSoft }}>پیگیری بعدی</th>
                          <th className="text-right font-medium pb-2">نام مشتری</th>
                          <th className="text-right font-medium pb-2">نوع نیاز</th>
                          <th className="text-right font-medium pb-2">منطقه</th>
                          <th className="text-right font-medium pb-2">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.slice(0, 5).map((c) => (
                          <tr key={c.id} className="border-b" style={{ borderColor: T.borderSoft }}>
                            <td className="py-3"><Badge tone={c.nextFollowUp === "عقب‌افتاده" ? "accent" : "muted"}>{c.nextFollowUp}</Badge></td>
                            <td className="py-3 font-semibold" style={{ color: T.text }}>{c.name}</td>
                            <td className="py-3" style={{ color: T.textMuted }}>{c.type}</td>
                            <td className="py-3" style={{ color: T.textMuted }}>{c.area}</td>
                            <td className="py-3"><Badge tone="gold">{c.temp}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {active === "customers" && (
              <>
                <div className="flex items-center justify-between">
                  <div />
                  <button onClick={() => setShowArchive((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}>
                    <Archive size={13} /> {showArchive ? "برگشت به کانبان" : `بایگانی (${customers.filter((c) => c.stage === "LOST").length})`}
                  </button>
                </div>
                {showArchive ? (
                  <div className="space-y-2">
                    {customers.filter((c) => c.stage === "LOST").length === 0 && <div className="text-sm text-center py-8" style={{ color: T.textFaint }}>هنوز مشتری‌ای بایگانی نشده</div>}
                    {customers.filter((c) => c.stage === "LOST").map((c) => (
                      <Card key={c.id}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold" style={{ color: T.text }}>{c.name}</div>
                            <div className="text-xs mt-1" style={{ color: T.textMuted }}>دلیل: {c.lostReason || "—"}</div>
                          </div>
                          <Badge tone="muted">از دست رفته</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {STAGES.map((s) => {
                      const inStage = customers.filter((c) => c.stage === s.key);
                      const isOver = dragOverStage === s.key;
                      return (
                        <div key={s.key} className="w-64 shrink-0" onDragOver={(e) => { e.preventDefault(); setDragOverStage(s.key); }} onDragLeave={() => setDragOverStage((cur) => (cur === s.key ? null : cur))} onDrop={(e) => { e.preventDefault(); if (dragId != null) moveCustomerToStage(dragId, s.key); setDragId(null); setDragOverStage(null); }}>
                          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-3 transition-colors" style={{ background: isOver ? T.accentGlow : T.surfaceRaised, outline: isOver ? `2px dashed ${T.accent}` : "none" }}>
                            <span className="text-sm font-bold" style={{ color: T.text }}>{s.label}</span>
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: T.goldSoft, color: T.gold }}>{inStage.length}</span>
                          </div>
                          <div className="space-y-2 min-h-[60px] rounded-xl transition-colors" style={{ background: isOver ? T.accentGlow : "transparent" }}>
                            {inStage.map((c) => (
                              <button key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => { setDragId(null); setDragOverStage(null); }} onClick={() => setSelectedCustomer(c)} className="w-full text-right p-3 rounded-xl border transition-colors cursor-grab active:cursor-grabbing" style={{ background: T.surface, borderColor: T.border, opacity: dragId === c.id ? 0.4 : 1 }}>
                                <div className="text-sm font-bold" style={{ color: T.text }}>{c.name}</div>
                                <div className="text-xs mt-1 flex items-center gap-1" style={{ color: T.textMuted }}><MapPin size={10} /> {c.area}</div>
                              </button>
                            ))}
                            <button className="w-full text-xs py-2 rounded-xl border border-dashed" style={{ color: T.textFaint, borderColor: T.border }}>+ افزودن مشتری</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {active === "properties" && (
              <>
                <div className="flex items-center gap-2">
                  {[{ key: "ALL", label: "همه" }, { key: "SALE", label: "فروش" }, { key: "RENT", label: "رهن‌واجاره" }].map((f) => (
                    <button key={f.key} onClick={() => setPropertyFilter(f.key)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: propertyFilter === f.key ? T.accent : T.surface, color: propertyFilter === f.key ? T.onAccent : T.textMuted, border: `1px solid ${propertyFilter === f.key ? T.accent : T.border}` }}>{f.label}</button>
                  ))}
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {properties.filter((p) => propertyFilter === "ALL" || p.dealType === propertyFilter).map((p, i) => (
                    <Card key={i}>
                      <div className="h-28 rounded-xl mb-3 flex items-center justify-center" style={{ background: T.surfaceRaised, ...woodgrain }}><Building2 size={26} style={{ color: T.textFaint }} /></div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone="muted">{p.type}</Badge>
                        <Badge tone={p.dealType === "SALE" ? "gold" : "success"}>{p.dealType === "SALE" ? "فروش" : "رهن‌واجاره"}</Badge>
                      </div>
                      <div className="font-bold text-sm" style={{ color: T.text }}>{p.title}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-extrabold" style={{ color: T.gold }}>{p.price}</span>
                        <Badge tone={p.status === "فعال" ? "success" : "muted"}>{p.status}</Badge>
                      </div>
                      <div className="text-xs mt-2 flex items-center gap-1" style={{ color: T.textMuted }}><TrendingUp size={12} /> {p.match} مشتری منطبق</div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {["viewings", "deals", "inbox", "documents", "analytics"].includes(active) && (
              <Card className="text-center py-14">
                <div className="text-sm" style={{ color: T.textMuted }}>این بخش («{NAV.find(n => n.key === active)?.label}») در فاز بعدی طراحی می‌شه.</div>
              </Card>
            )}
          </main>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-30 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm h-full overflow-y-auto p-5 border-r" style={{ background: T.bgSoft, borderColor: T.border }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold" style={{ color: T.text }}>پروفایل مشتری</h3>
              <button onClick={() => setSelectedCustomer(null)}><X size={18} style={{ color: T.textFaint }} /></button>
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-lg" style={{ background: T.goldSoft, color: T.gold }}>{selectedCustomer.name[0]}</div>
              <div>
                <div className="font-bold" style={{ color: T.text }}>{selectedCustomer.name}</div>
                <div className="text-xs flex items-center gap-1 mt-1" style={{ color: T.textMuted }}><Phone size={11} /> {selectedCustomer.phone}</div>
                {selectedCustomer.email && <div className="text-xs flex items-center gap-1 mt-1" style={{ color: T.textMuted }}><Mail size={11} /> {selectedCustomer.email}</div>}
              </div>
            </div>
            <div className="mb-2"><Badge tone="gold">{STAGES.find(s => s.key === selectedCustomer.stage)?.label}</Badge></div>
            <Card className="mt-4" style={{ background: T.surfaceRaised }}>
              <div className="text-xs font-bold mb-3" style={{ color: T.gold }}>اطلاعات شخصی</div>
              {[["نوع", selectedCustomer.type], ["منطقه", selectedCustomer.area], ["بودجه", selectedCustomer.budget], ["منبع مشتری", selectedCustomer.src], ["دما", selectedCustomer.temp]].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-1.5 text-sm">
                  <span style={{ color: T.textFaint }}>{label}</span>
                  <span style={{ color: T.text }}>{val}</span>
                </div>
              ))}
            </Card>
            <button className="w-full mt-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: T.accent, color: T.onAccent }}><Plus size={15} /> ثبت فعالیت جدید</button>
          </div>
        </div>
      )}

      <div className="md:hidden fixed bottom-0 inset-x-0 flex justify-around border-t py-2" style={{ background: T.bgSoft, borderColor: T.borderSoft }}>
        {NAV.slice(0, 5).map((n) => {
          const Icon = n.icon;
          const isActive = active === n.key;
          return (
            <button key={n.key} onClick={() => setActive(n.key)} className="flex flex-col items-center gap-1 px-2">
              <Icon size={18} style={{ color: isActive ? T.gold : T.textFaint }} />
              <span className="text-[10px]" style={{ color: isActive ? T.gold : T.textFaint }}>{n.label}</span>
            </button>
          );
        })}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');`}</style>
    </div>
  );
}