"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS, PROPERTY_STATUS_LABELS } from "@/lib/constants";
import { formatToman } from "@/lib/utils";

type Property = {
  id: string;
  code?: string | null;
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
  landSizeSqm?: number | null;
  beds?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  unitsPerFloor?: number | null;
  unitCount?: number | null;
  buildingFloors?: number | null;
  passageWidth?: number | null;
  buildingFrontage?: number | null;
  hasParking?: boolean;
  hasStorage?: boolean;
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasRenovated?: boolean;
  isNewBuild?: boolean;
  listedBy?: { id: string; name: string } | null;
};

const emptyFilters = {
  search: "",
  type: "",
  dealType: "",
  status: "",
  priceMin: "",
  priceMax: "",
  rentMin: "",
  rentMax: "",
  sizeMin: "",
  sizeMax: "",
  bedsMin: "",
  hasElevator: false,
  hasParking: false,
  hasStorage: false,
  hasTerrace: false,
  hasRenovated: false,
  isNewBuild: false,
};

export default function PropertiesPage() {
  const [list, setList] = useState<Property[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [showFlags, setShowFlags] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    selectedRegions.forEach((r) => params.append("regions", r));
    if (filters.type) params.set("type", filters.type);
    if (filters.dealType) params.set("dealType", filters.dealType);
    if (filters.status) params.set("status", filters.status);
    if (filters.priceMin) params.set("priceMin", filters.priceMin);
    if (filters.priceMax) params.set("priceMax", filters.priceMax);
    if (filters.rentMin) params.set("rentMin", filters.rentMin);
    if (filters.rentMax) params.set("rentMax", filters.rentMax);
    if (filters.sizeMin) params.set("sizeMin", filters.sizeMin);
    if (filters.sizeMax) params.set("sizeMax", filters.sizeMax);
    if (filters.bedsMin) params.set("bedsMin", filters.bedsMin);
    if (filters.hasElevator) params.set("hasElevator", "true");
    if (filters.hasParking) params.set("hasParking", "true");
    if (filters.hasStorage) params.set("hasStorage", "true");
    if (filters.hasTerrace) params.set("hasTerrace", "true");
    if (filters.hasRenovated) params.set("hasRenovated", "true");
    if (filters.isNewBuild) params.set("isNewBuild", "true");
    params.set("limit", "100");
    params.set("page", "1");

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
  }, [filters, selectedRegions]);

  useEffect(() => {
    const t = setTimeout(load, filters.search || filters.priceMin || filters.priceMax ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search, filters.priceMin, filters.priceMax]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setTypes(d.propertyTypes);
    });
  }, []);

  const isSale = filters.dealType === "SALE";
  const isRent = filters.dealType === "RENT";

  function toggleRegion(r: string) {
    setSelectedRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function clearFilters() {
    setFilters({ ...emptyFilters });
    setSelectedRegions([]);
  }

  function cardChips(p: Property) {
    const chips: string[] = [];
    if (p.beds != null && p.type !== "LAND") chips.push(`${p.beds} خواب`);
    if (p.sizeSqm != null) chips.push(`${p.sizeSqm} متر`);
    if (p.landSizeSqm != null && (p.type === "VILLA" || p.type === "KOLANGI" || p.type === "LAND")) {
      chips.push(`زمین ${p.landSizeSqm}`);
    }
    if (p.type === "APARTMENT") {
      if (p.unitsPerFloor != null) chips.push(`${p.unitsPerFloor}واحدی/طبقه`);
      if (p.unitCount != null) chips.push(`${p.unitCount} واحد`);
      if (p.floor != null) chips.push(`طبقه ${p.floor}`);
    }
    if (p.buildingFrontage != null) chips.push(`بر ${p.buildingFrontage}`);
    if (p.passageWidth != null) chips.push(`گذر ${p.passageWidth}`);
    return chips;
  }

  function featureBadges(p: Property) {
    const items: { key: string; label: string }[] = [];
    if (p.hasElevator) items.push({ key: "el", label: "آسانسور" });
    if (p.hasParking) items.push({ key: "pk", label: "پارکینگ" });
    if (p.hasStorage) items.push({ key: "st", label: "انباری" });
    if (p.hasTerrace) items.push({ key: "tr", label: "تراس" });
    if (p.hasRenovated) items.push({ key: "rn", label: "بازسازی" });
    if (p.isNewBuild) items.push({ key: "nb", label: "نوساز" });
    return items;
  }

  return (
    <div>
      <Header
        title="فایل‌ها"
        subtitle={total != null ? `${total} فایل` : "جستجوی فایل"}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={clearFilters} size="sm">پاک کردن فیلتر</Button>
            <Link href="/properties/new"><Button>＋ فایل جدید</Button></Link>
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-[1200px]">
        <Card className="p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="کد، عنوان، منطقه یا آدرس..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">همه انواع</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select value={filters.dealType} onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}>
              <option value="">همه معاملات</option>
              <option value="SALE">فروش</option>
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

          {/* مناطق چندتایی */}
          <div className="mt-3">
            <div className="text-[12px] font-bold text-[var(--ink-2)] mb-1.5">
              منطقه {selectedRegions.length === 0 ? "— همه" : `— ${selectedRegions.length} انتخاب`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedRegions([])}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${
                  selectedRegions.length === 0
                    ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--ink-2)]"
                }`}
              >
                همه مناطق
              </button>
              {regions.map((r) => {
                const on = selectedRegions.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRegion(r)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] ${
                      on
                        ? "border-[var(--sea)] bg-[var(--sea-soft)] text-[var(--sea)] font-bold"
                        : "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* قیمت و متراژ */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {!isRent ? (
              <div className="flex items-center gap-1.5">
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={isSale ? "قیمت از" : "قیمت/ودیعه از"}
                  value={filters.priceMin}
                  onChange={(e) => setFilters({ ...filters, priceMin: e.target.value.replace(/[^0-9]/g, "") })}
                />
                <span className="text-[var(--ink-3)]">تا</span>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={isSale ? "قیمت تا" : "قیمت/ودیعه تا"}
                  value={filters.priceMax}
                  onChange={(e) => setFilters({ ...filters, priceMax: e.target.value.replace(/[^0-9]/g, "") })}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="ودیعه از"
                  value={filters.priceMin}
                  onChange={(e) => setFilters({ ...filters, priceMin: e.target.value.replace(/[^0-9]/g, "") })}
                />
                <span className="text-[var(--ink-3)]">تا</span>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="ودیعه تا"
                  value={filters.priceMax}
                  onChange={(e) => setFilters({ ...filters, priceMax: e.target.value.replace(/[^0-9]/g, "") })}
                />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                inputMode="numeric"
                dir="ltr"
                placeholder="اجاره ماه از"
                value={filters.rentMin}
                onChange={(e) => setFilters({ ...filters, rentMin: e.target.value.replace(/[^0-9]/g, "") })}
              />
              <span className="text-[var(--ink-3)]">تا</span>
              <Input
                inputMode="numeric"
                dir="ltr"
                placeholder="اجاره ماه تا"
                value={filters.rentMax}
                onChange={(e) => setFilters({ ...filters, rentMax: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                inputMode="numeric"
                dir="ltr"
                placeholder="متراژ از"
                value={filters.sizeMin}
                onChange={(e) => setFilters({ ...filters, sizeMin: e.target.value.replace(/[^0-9]/g, "") })}
              />
              <span className="text-[var(--ink-3)]">تا</span>
              <Input
                inputMode="numeric"
                dir="ltr"
                placeholder="متراژ تا"
                value={filters.sizeMax}
                onChange={(e) => setFilters({ ...filters, sizeMax: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </div>
            <Input
              inputMode="numeric"
              dir="ltr"
              placeholder="حداقل خواب"
              value={filters.bedsMin}
              onChange={(e) => setFilters({ ...filters, bedsMin: e.target.value.replace(/[^0-9]/g, "") })}
            />
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowFlags((v) => !v)}
              className="text-[12px] font-medium text-[var(--ink-2)] hover:underline"
            >
              {showFlags ? "▲" : "▼"} فیلترهای امکانات
            </button>
            {showFlags && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {([
                  ["hasElevator", "آسانسور"],
                  ["hasParking", "پارکینگ"],
                  ["hasStorage", "انباری"],
                  ["hasTerrace", "تراس"],
                  ["hasRenovated", "بازسازی‌شده"],
                  ["isNewBuild", "نوساز"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters[k]}
                      onChange={(e) => setFilters({ ...filters, [k]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </Card>

        {list.length === 0 ? (
          <div className="max-w-[560px] rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--paper-2)] border border-[var(--line)]">🏠</div>
            <div className="mt-3 text-[14px] font-bold">فایلی با این فیلترها یافت نشد</div>
            <div className="mt-1 text-[13px] leading-6 text-[var(--ink-3)]">
              بازه قیمت/متراژ را باز کنید یا «همه مناطق» را بزنید.
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="outline" onClick={clearFilters}>پاک کردن فیلترها</Button>
              <Link href="/properties/new"><Button>ساخت فایل</Button></Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => {
              const chips = cardChips(p);
              const feats = featureBadges(p);
              return (
                <Link key={p.id} href={`/properties/${p.id}`} className="group">
                  <Card className="h-full p-0 overflow-hidden hover:shadow-[0_8px_24px_rgba(22,26,36,0.08)] transition-shadow">
                    <div
                      className="h-1.5 w-full"
                      style={{ background: p.dealType === "SALE" ? "var(--pomegranate)" : "var(--sea)" }}
                    />
                    <div className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {p.code && (
                            <span className="text-[12px] font-bold text-[var(--ink-2)]" dir="ltr">{p.code}</span>
                          )}
                          <Badge className="text-[11px]">{PROPERTY_TYPE_LABELS[p.type] ?? p.type}</Badge>
                        </div>
                        <Badge
                          className={`text-[11px] ${
                            p.visibility === "RESTRICTED"
                              ? "bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)]"
                              : "bg-[var(--sea-soft)] text-[var(--sea)] border-[#C7E5E0]"
                          }`}
                        >
                          {DEAL_TYPE_LABELS[p.dealType] ?? p.dealType}
                        </Badge>
                      </div>

                      <h3 className="mt-2 text-[13.5px] font-extrabold leading-5 line-clamp-2 group-hover:text-[var(--pomegranate)]">
                        {p.title}
                      </h3>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                        <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5">{p.region}</span>
                        {chips.map((c) => (
                          <span key={c} className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5">{c}</span>
                        ))}
                      </div>

                      {feats.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {feats.map((f) => (
                            <span
                              key={f.key}
                              className="rounded-md bg-[var(--paper-2)] border border-[var(--line)] px-1.5 py-0.5 text-[10.5px] text-[var(--ink-2)]"
                            >
                              {f.label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <div className="text-[14px] font-extrabold tracking-tight">
                            {p.dealType === "SALE"
                              ? formatToman(p.salePriceToman)
                              : formatToman(p.depositToman)}
                          </div>
                          <div className="text-[11px] text-[var(--ink-3)]">
                            {p.dealType === "SALE" ? "فروش" : "رهن"}
                            {p.dealType === "RENT" && p.monthlyRentToman
                              ? ` · اجاره ${formatToman(p.monthlyRentToman)}`
                              : ""}
                          </div>
                        </div>
                        <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[10.5px] text-[var(--ink-3)]">
                          {PROPERTY_STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </div>
                      {p.listedBy?.name && (
                        <div className="mt-2 text-[11px] text-[var(--ink-3)]">مشاور: {p.listedBy.name}</div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
