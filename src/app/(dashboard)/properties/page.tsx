"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatToman } from "@/lib/utils";

type Property = { id: string; title: string; type: string; dealType: string; region: string; status: string; visibility: string; salePriceToman: string | null; depositToman: string | null; sizeSqm: number | null };

export default function PropertiesPage() {
  const [list, setList] = useState<Property[]>([]);
  useEffect(() => { fetch("/api/properties").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])); }, []);
  return (
    <div>
      <Header title="فایل‌ها" subtitle={`${list.length} فایل — هر کارت یک ملک با قیمت، منطقه و نوع معامله`} action={<Link href="/properties/new"><Button>＋ فایل جدید</Button></Link>} />
      <div className="p-6">
        {list.length === 0 ? (
          <div className="max-w-[560px] rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--paper-2)] border border-[var(--line)]">🏠</div>
            <div className="mt-3 text-[14px] font-bold">هنوز فایلی ثبت نشده</div>
            <div className="mt-1 text-[13px] leading-6 text-[var(--ink-3)]">اولین فایل را بسازید تا موتور تطبیق، مشتری‌های مرتبط را پیدا کند.</div>
            <Link href="/properties/new" className="mt-4 inline-block"><Button>ساخت فایل</Button></Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-[1120px]">
            {list.map((p) => (
              <Link key={p.id} href={`/properties/${p.id}`} className="group">
                <Card className="h-full p-0 overflow-hidden hover:shadow-[0_8px_24px_rgba(22,26,36,0.08)] transition-shadow">
                  <div className="h-1.5 w-full" style={{ background: p.dealType === "SALE" ? "var(--pomegranate)" : "var(--sea)" }} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge>{PROPERTY_TYPE_LABELS[p.type] ?? p.type}</Badge>
                      <Badge className={p.visibility === "RESTRICTED" ? "bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)]" : "bg-[var(--sea-soft)] text-[var(--sea)] border-[#C7E5E0]"}>
                        {DEAL_TYPE_LABELS[p.dealType] ?? p.dealType}
                      </Badge>
                    </div>
                    <h3 className="mt-3 text-[14px] font-extrabold leading-5 line-clamp-2 group-hover:text-[var(--pomegranate)]">{p.title}</h3>
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
                      <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5">{p.region}</span>
                      {p.sizeSqm ? <span>{p.sizeSqm} متر</span> : null}
                      <span className="mr-auto rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px]">{p.status}</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-[15px] font-extrabold tracking-tight">{p.dealType === "SALE" ? formatToman(p.salePriceToman) : formatToman(p.depositToman)}</span>
                      <span className="text-[11px] tracking-widest text-[var(--ink-3)]">{p.dealType === "SALE" ? "فروش" : "رهن"}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
