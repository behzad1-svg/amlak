"use client";

import { useMemo, useState } from "react";

type Member = "مدیر دفتر" | "سارا رضایی" | "مهدی کریمی";
type Work = { id: number; title: string; note: string; day: number; time: string; member: Member; priority: "فوری" | "عادی" | "کم"; done: boolean };
const members: Member[] = ["مدیر دفتر", "سارا رضایی", "مهدی کریمی"];
const days = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const initial: Work[] = [
  { id: 1, title: "تماس با مالک خیابان فرهنگ", note: "هماهنگی برای بازدید عصر", day: 0, time: "09:30", member: "سارا رضایی", priority: "فوری", done: false },
  { id: 2, title: "بررسی فایل‌های جدید", note: "فایل‌های ثبت‌شده در دیوار", day: 1, time: "11:00", member: "مدیر دفتر", priority: "عادی", done: false },
  { id: 3, title: "بازدید آپارتمان ساحلی", note: "مشتری: آقای احمدی", day: 2, time: "17:00", member: "مهدی کریمی", priority: "فوری", done: false },
  { id: 4, title: "پیگیری قرارداد اجاره", note: "ارسال نسخه نهایی قرارداد", day: 4, time: "10:00", member: "سارا رضایی", priority: "عادی", done: false },
];

export default function Planner() {
  const [works, setWorks] = useState(initial); const [selected, setSelected] = useState(0); const [week, setWeek] = useState(0); const [modal, setModal] = useState(false); const [dragged, setDragged] = useState<number | null>(null); const [form, setForm] = useState({ title: "", note: "", time: "09:00", member: "مدیر دفتر" as Member, priority: "عادی" as Work["priority"] });
  const todayWorks = useMemo(() => works.filter(w => w.day === selected).sort((a,b) => a.time.localeCompare(b.time)), [works, selected]);
  const add = (event: React.FormEvent) => { event.preventDefault(); setWorks([...works, { ...form, id: Date.now(), day: selected, done: false }]); setModal(false); setForm({ title: "", note: "", time: "09:00", member: "مدیر دفتر", priority: "عادی" }); };
  const move = (day: number) => { if (dragged !== null) setWorks(works.map(w => w.id === dragged ? { ...w, day } : w)); setDragged(null); };
  return <main>
    <aside><div className="brand"><span>ر</span><div><b>روزان</b><small>برنامه‌ریزی دفتر</small></div></div><button className="new" onClick={() => setModal(true)}>＋ کار جدید</button><nav><a className="active">▦ برنامه هفتگی</a><a>◷ کارهای امروز <i>{todayWorks.length}</i></a><a>◻ کارهای انجام‌شده</a><a>♙ اعضای تیم</a></nav><div className="profile"><div className="avatar">م</div><div><b>مدیر دفتر</b><small>دسترسی مدیر</small></div></div></aside>
    <section className="content"><header><div><p>سه‌شنبه، ۲ مهر ۱۴۰۵</p><h1>سلام مدیر، روز خوبی داشته باشی.</h1></div><div className="team">{members.map(m => <span key={m}>{m[0]}</span>)} <button>＋ دعوت عضو</button></div></header>
      <div className="toolbar"><div><button onClick={() => setWeek(week-1)}>‹</button><strong>{week === 0 ? "این هفته" : `${Math.abs(week)} هفته ${week > 0 ? "بعد" : "قبل"}`}</strong><button onClick={() => setWeek(week+1)}>›</button></div><button className="today" onClick={() => {setWeek(0);setSelected(0)}}>امروز</button></div>
      <div className="calendar">{days.map((d,index) => <div key={d} className={`day ${selected === index ? "chosen" : ""}`} onClick={() => setSelected(index)} onDragOver={e => e.preventDefault()} onDrop={() => move(index)}><div className="date"><small>{d}</small><b className={index === 0 ? "now" : ""}>{index + 2}</b></div><div className="cards">{works.filter(w => w.day === index).map(w => <button draggable key={w.id} onDragStart={() => setDragged(w.id)} onClick={(e) => {e.stopPropagation(); setSelected(index)}} className={`card ${w.priority} ${w.done ? "done" : ""}`}><span>{w.time}</span><b>{w.title}</b><small>{w.member}</small></button>)}</div><button className="quick" onClick={(e)=>{e.stopPropagation();setSelected(index);setModal(true)}}>＋ افزودن</button></div>)}</div>
      <div className="bottom"><section><div className="section-title"><div><p>برنامه‌ی روز</p><h2>{days[selected]}، {selected + 2} مهر</h2></div><span>{todayWorks.filter(w => !w.done).length} کار باقی‌مانده</span></div>{todayWorks.length ? <div className="agenda">{todayWorks.map(w => <button key={w.id} className={w.done ? "checked" : ""} onClick={() => setWorks(works.map(x => x.id === w.id ? {...x, done: !x.done} : x))}><i>{w.done ? "✓" : ""}</i><time>{w.time}</time><div><b>{w.title}</b><small>{w.note}</small></div><em>{w.member}</em></button>)}</div> : <div className="empty">برای این روز کاری ثبت نشده است.</div>}</section><aside className="hint"><b>جابه‌جایی سریع</b><p>کارت هر کار را بکشید و روی روز موردنظر رها کنید تا زمان‌بندی آن تغییر کند.</p></aside></div>
    </section>
    {modal && <div className="overlay" onMouseDown={() => setModal(false)}><form onSubmit={add} onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><p>کار جدید</p><h2>برنامه‌ریزی یک کار</h2></div><button type="button" onClick={()=>setModal(false)}>×</button></div><label>عنوان کار<input autoFocus required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="مثلاً تماس با مالک" /></label><label>توضیحات<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="نکات ضروری برای انجام کار" /></label><div className="fields"><label>ساعت<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></label><label>مسئول<select value={form.member} onChange={e=>setForm({...form,member:e.target.value as Member})}>{members.map(m=><option key={m}>{m}</option>)}</select></label></div><label>اولویت<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Work["priority"]})}><option>فوری</option><option>عادی</option><option>کم</option></select></label><div className="actions"><button type="button" onClick={()=>setModal(false)}>انصراف</button><button type="submit">ثبت کار</button></div></form></div>}
  </main>;
}
