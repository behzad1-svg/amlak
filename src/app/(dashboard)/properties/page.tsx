"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";
import { PROPERTY_STATUS_LABELS } from "@/lib/constants";
import { formatToman } from "@/lib/utils";

type Property = {
  id: string;
  title: string;
  type: string;
  dealType: string;
  region: string;
  status: string;
  visibility: string;
  salePriceToman: string | null;
  depositToman: string | null;
  monthlyRentToman: string | null;
  sizeSqm: number | null;
};

export default function PropertiesPage() {
  const [list, setList] = useState<Property[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    region: "",
    type: "",
    dealType: "",
    status: "",
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.region) params.set("region", filters.region);
    if (filters.type) params.set("type", filters.type);
    if (filters.dealType) params.set("dealType", filters.dealType);
    if (filters.status) params.set("status", filters.status);
    params.set("limit", "100");
    const res = await fetch(`/api/properties?${params.toString()}`);
    const d = await res.json();
    if (Array.isArray(d)) {
      setList(d);
      setTotal(d.length);
    } else if (d?.properties) {
      setList(d.properties);
      setTotal(d.total ?? d.properties.length);
    } else {
      setList([]);
      setTotal(0);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setTypes(d.propertyTypes);
    });
  }, []);

  return (
    <div>
      <Header
        title="فایل‌ها"
        subtitle={total != null ? `${total} فایل` : "فایل‌های املاک"}
        action={<Link href="/properties/new"><Button>＋ فایل جدید</Button></Link>}
      />
      <div className="p-6 space-y-4 max-w-[1120px]">
        <Card className="p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              placeholder="جستجوی عنوان..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <Select value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })}>
              <option value="">همه مناطق</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">همه انواع</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select value={filters.dealType} onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}>
              <option value="">همه معاملات</option>
              <option value="SALE">خرید / فروش</option>
              <option value="RENT">رهن و اجاره</option>
            </Select>
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">همه وضعیت‌ها</option>
              <option value="ACTIVE">فعال</option>
              <option value="RESERVED">رزرو</option>
              <option value="SOLD">فروخته‌شده</option>
              <option value="RENTED">اجاره‌رفته</option>
            </Select>
          </div>
        </Card>

        {list.length === 0 ? (
          <div className="max-w-[560px] rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--paper-2)] border border-[var(--line)]">🏠</div>
            <div className="mt-3 text-[14px] font-bold">فایلی یافت نشد</div>
            <div className="mt-1 text-[13px] leading-6 text-[var(--ink-3)]">
              فیلترها را بردارید یا اولین فایل را بسازید تا موتور تطبیق مشتری‌های مرتبط را پیدا کند.
            </div>
            <Link href="/properties/new" className="mt-4 inline-block"><Button>ساخت فایل</Button></Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      <span className="mr-auto rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px]">
                        {PROPERTY_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-[15px] font-extrabold tracking-tight">
                        {p.dealType === "SALE" ? formatToman(p.salePriceToman) : formatToman(p.depositToman)}
                      </span>
                      <span className="text-[11px] tracking-widest text-[var(--ink-3)]">
                        {p.dealType === "SALE" ? "فروش" : "رهن"}
                      </span>
                    </div>
                    {p.dealType === "RENT" && p.monthlyRentToman && (
                      <div className="mt-1 text-[12px] text-[var(--ink-3)]">اجاره {formatToman(p.monthlyRentToman)}</div>
                    )}
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
