"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Home, Users, Building2, CalendarClock, Handshake, Inbox as InboxIcon,
  FileText, BarChart3, Bell, Settings, Search, Phone, MapPin,
  Clock, ChevronLeft, Target, X, Archive, Plus
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  type: string;
  stage: string;
  temp: string;
  area: string | null;
  budget: string | null;
  source: string;
  nextFollowUp: string | null;
  lostReason?: string | null;
};

const T = {
  bg: "#F7F4F3", bgSoft: "#FFFFFF", surface: "#FFFFFF", surfaceRaised: "#FBF3F2",
  border: "#EDE1DF", borderSoft: "#F1E6E4", accent: "#96222E", accentSoft: "#7A1B26",
  accentGlow: "rgba(150,34,46,0.10)", gold: "#B4842E", goldSoft: "rgba(180,132,46,0.12)",
  text: "#241614", textMuted: "#6E5C58", textFaint: "#A6928E", success: "#2E8354",
  successSoft: "rgba(46,131,84,0.10)", onAccent: "#FFFFFF",
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

const matches = [
  { pct: 96, file: "فایل #۴۵۲۱", desc: "مناسب برای محمد رضایی", ago: "۲ ساعت پیش" },
  { pct: 92, file: "فایل #۳۴۱", desc: "مناسب برای علی احمدی", ago: "۳ ساعت پیش" },
  { pct: 89, file: "فایل #۲۲۱۰", desc: "مناسب برای سارا کریمی", ago: "۵ ساعت پیش" },
];

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

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} style={{ color: T.gold }} />
      <h3 className="font-bold text-base" style={{ color: T.text }}>{title}</h3>
    </div>
  );
}

export default function SajCRM() {
  const [active, setActive] = useState("today");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  
  // State برای مودال افزودن مشتری
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "", phone: "", type: "BUYER", stage: "NEW", temp: "WARM", 
    source: "DIRECT_CALL", area: "", budget: "", nextFollowUp: new Date().toISOString().slice(0, 16)
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCustomers = () => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCustomer,
          nextFollowUpAt: newCustomer.nextFollowUp ? new Date(newCustomer.nextFollowUp).toISOString() : null,
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setIsAddModalOpen(false);
        setNewCustomer({
          name: "", phone: "", type: "BUYER", stage: "NEW", temp: "WARM", 
          source: "DIRECT_CALL", area: "", budget: "", nextFollowUp: new Date().toISOString().slice(0, 16)
        });
        fetchCustomers();
      } else {
        alert(data.error || "خطا در ثبت مشتری");
      }
    } catch (error) {
      console.error(error);
      alert("خطا در ارتباط با سرور");
    } finally {
      setSubmitting(false);
    }
  };

  const todayFollowUps = customers.filter(c => c.nextFollowUp === "امروز");
  const viewings = customers.filter(c => c.stage === "VIEWING");
  const overdue = customers.filter(c => c.nextFollowUp === "عقب‌افتاده");

  const customersByStage = useMemo(() => {
    const grouped: Record<string, typeof customers> = {};
    for (const customer of customers) {
      if (!grouped[customer.stage]) {
        grouped[customer.stage] = [];
      }
      grouped[customer.stage].push(customer);
    }
    return grouped;
  }, [customers]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen" style={{ background: T.bg, color: T.text }}>در حال بارگذاری...</div>;
  }

  return (
    <div dir="rtl" style={{ ...font, background: T.bg, minHeight: "100vh", color: T.text }}>
      <div className="flex">
        {/* Sidebar */}
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

        {/* Main Content */}
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
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-extrabold" style={{ color: T.text }}>سلام بهزاد 👋</h1>
                    <p className="text-sm mt-1" style={{ color: T.textMuted }}>امروز شنبه، ۲۵ مرداد ۱۴۰۳ — این‌هفته {viewings.length} بازدید، {todayFollowUps.length} پیگیری و {matches.length} Match جدید داری.</p>
                  </div>
                  <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors" style={{ background: T.accent, color: T.onAccent }}>
                    <Plus size={16} /> افزودن مشتری جدید
                  </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><Clock size={18} style={{ color: T.accent }} /><div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{overdue.length}</div><div className="text-xs mt-1" style={{ color: T.textMuted }}>عقب‌افتاده</div></Card>
                  <Card><CalendarClock size={18} style={{ color: T.gold }} /><div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{todayFollowUps.length}</div><div className="text-xs mt-1" style={{ color: T.textMuted }}>پیگیری امروز</div></Card>
                  <Card><Users size={18} style={{ color: T.success }} /><div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{viewings.length}</div><div className="text-xs mt-1" style={{ color: T.textMuted }}>بازدید</div></Card>
                  <Card><Target size={18} style={{ color: T.gold }} /><div className="text-2xl font-extrabold mt-3" style={{ color: T.text }}>{matches.length}</div><div className="text-xs mt-1" style={{ color: T.textMuted }}>Match جدید</div></Card>
                </div>

                {/* Matches and Priorities Grid */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card>
                    <SectionTitle icon={Target} title="Matchهای جدید" />
                    <div className="space-y-3">
                      {matches.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.surfaceRaised }}>
                          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0" style={{ border: `2px solid ${T.success}`, color: T.success }}>{m.pct}%</div>
                          <div className="flex-1"><div className="text-sm font-bold" style={{ color: T.text }}>{m.file}</div><div className="text-xs" style={{ color: T.textMuted }}>{m.desc}</div></div>
                          <span className="text-[11px]" style={{ color: T.textFaint }}>{m.ago}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card>
                    <SectionTitle icon={CalendarClock} title="اولویت‌های امروز" />
                    <div className="space-y-3">
                      {todayFollowUps.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: T.surfaceRaised }}>
                          <div className="flex items-center gap-3">
                            <Badge tone="gold">پیگیری</Badge>
                            <div><div className="text-sm font-bold" style={{ color: T.text }}>{c.name}</div><div className="text-xs mt-0.5" style={{ color: T.textMuted }}>{c.area || "نامشخص"} — {c.type}</div></div>
                          </div>
                          <ChevronLeft size={16} style={{ color: T.textFaint }} />
                        </div>
                      ))}
                      {todayFollowUps.length === 0 && <div className="text-sm text-center py-4" style={{ color: T.textFaint }}>پیگیری امروز ندارید</div>}
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
                            <td className="py-3"><Badge tone={c.nextFollowUp === "عقب‌افتاده" ? "accent" : "muted"}>{c.nextFollowUp || "—"}</Badge></td>
                            <td className="py-3 font-semibold" style={{ color: T.text }}>{c.name}</td>
                            <td className="py-3" style={{ color: T.textMuted }}>{c.type}</td>
                            <td className="py-3" style={{ color: T.textMuted }}>{c.area || "—"}</td>
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
                <div className="flex items-center justify-between mb-4">
                  <div />
                  <div className="flex gap-2">
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: T.accent, color: T.onAccent }}><Plus size={15} /> افزودن مشتری</button>
                    <button onClick={() => setShowArchive((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}>
                      <Archive size={13} /> {showArchive ? "برگشت به کانبان" : `بایگانی`}
                    </button>
                  </div>
                </div>
                {showArchive ? (
                  <div className="space-y-2">
                    {customers.filter((c) => c.stage === "LOST").length === 0 && <div className="text-sm text-center py-8" style={{ color: T.textFaint }}>هنوز مشتری‌ای بایگانی نشده</div>}
                    {customers.filter((c) => c.stage === "LOST").map((c) => (
                      <Card key={c.id}><div className="flex items-center justify-between"><div><div className="text-sm font-bold" style={{ color: T.text }}>{c.name}</div><div className="text-xs mt-1" style={{ color: T.textMuted }}>دلیل: {c.lostReason || "—"}</div></div><Badge tone="muted">از دست رفته</Badge></div></Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {STAGES.map((s) => {
                      const inStage = customersByStage[s.key] || [];
                      return (
                        <div key={s.key} className="w-64 shrink-0">
                          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-3" style={{ background: T.surfaceRaised }}>
                            <span className="text-sm font-bold" style={{ color: T.text }}>{s.label}</span>
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: T.goldSoft, color: T.gold }}>{inStage.length}</span>
                          </div>
                          <div className="space-y-2 min-h-[60px]">
                            {inStage.map((c) => (
                              <button key={c.id} onClick={() => setSelectedCustomer(c)} className="w-full text-right p-3 rounded-xl border transition-colors" style={{ background: T.surface, borderColor: T.border }}>
                                <div className="text-sm font-bold" style={{ color: T.text }}>{c.name}</div>
                                <div className="text-xs mt-1 flex items-center gap-1" style={{ color: T.textMuted }}><MapPin size={10} /> {c.area || "نامشخص"}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {["properties", "viewings", "deals", "inbox", "documents", "analytics"].includes(active) && (
              <Card className="text-center py-14">
                <div className="text-sm" style={{ color: T.textMuted }}>این بخش («{NAV.find(n => n.key === active)?.label}») در فاز بعدی طراحی می‌شه.</div>
              </Card>
            )}
          </main>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg" style={{ color: T.text }}>افزودن مشتری جدید</h3>
              <button onClick={() => setIsAddModalOpen(false)}><X size={20} style={{ color: T.textFaint }} /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>نام و نام خانوادگی *</label>
                <input required type="text" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>شماره تماس *</label>
                  <input required type="tel" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>نوع نیاز</label>
                  <select value={newCustomer.type} onChange={e => setNewCustomer({...newCustomer, type: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }}>
                    <option value="BUYER">خریدار</option>
                    <option value="SELLER">فروشنده</option>
                    <option value="TENANT">مستاجر</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>مرحله</label>
                  <select value={newCustomer.stage} onChange={e => setNewCustomer({...newCustomer, stage: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>دما (اهمیت)</label>
                  <select value={newCustomer.temp} onChange={e => setNewCustomer({...newCustomer, temp: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }}>
                    <option value="HOT">داغ 🔥</option>
                    <option value="WARM">گرم 🌤️</option>
                    <option value="COLD">سرد ❄️</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>منطقه مورد نظر</label>
                <input type="text" value={newCustomer.area} onChange={e => setNewCustomer({...newCustomer, area: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }} />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.textMuted }}>پیگیری بعدی *</label>
                <input required type="datetime-local" value={newCustomer.nextFollowUp} onChange={e => setNewCustomer({...newCustomer, nextFollowUp: e.target.value})} className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none" style={{ borderColor: T.border, background: T.bgSoft, color: T.text }} />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.surfaceRaised, color: T.textMuted }}>انصراف</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.accent, color: T.onAccent, opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'در حال ثبت...' : 'ثبت مشتری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Modal (Existing) */}
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
              </div>
            </div>
            <div className="mb-2"><Badge tone="gold">{STAGES.find(s => s.key === selectedCustomer.stage)?.label}</Badge></div>
            <Card className="mt-4" style={{ background: T.surfaceRaised }}>
              <div className="text-xs font-bold mb-3" style={{ color: T.gold }}>اطلاعات شخصی</div>
              {[["نوع", selectedCustomer.type], ["منطقه", selectedCustomer.area || "—"], ["بودجه", selectedCustomer.budget || "—"], ["منبع مشتری", selectedCustomer.source], ["دما", selectedCustomer.temp]].map(([label, val]) => (
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

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');`}</style>
    </div>
  );
}