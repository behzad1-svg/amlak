"use client";
import { useState } from "react";
import { Calculator } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label, NumberInput } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatToman, toEnDigits, toFaDigits } from "@/lib/utils";
import { DEFAULT_TAX_RATE_PCT } from "@/lib/constants";
import {
  DEFAULT_SALE_COMMISSION_PCT,
  RENT_COMMISSION_PCT,
  calcRentCommission,
  calcSaleCommission,
  calcVat,
} from "@/lib/commission";

// ماشین‌حساب زندهٔ کمیسیون، پایین داشبورد — مشاور مبلغ را می‌زند و
// همان‌جا کمیسیون بدون مالیات و با مالیات را می‌بیند؛ بدون ماشین‌حساب.
export function CommissionCalculator() {
  const [mode, setMode] = useState<"SALE" | "RENT">("SALE");
  const [price, setPrice] = useState("");
  const [percent, setPercent] = useState(String(DEFAULT_SALE_COMMISSION_PCT));
  const [deposit, setDeposit] = useState("");
  const [rent, setRent] = useState("");

  const commission =
    mode === "SALE"
      ? calcSaleCommission(Number(price) || 0, Number(toEnDigits(percent).replace(/[^0-9.]/g, "")) || 0)
      : calcRentCommission(Number(deposit) || 0, Number(rent) || 0);
  const vat = calcVat(commission);
  const total = commission + vat;

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white">
            <Calculator className="h-4 w-4" />
          </span>
          ماشین‌حساب کمیسیون
        </CardTitle>
      </CardHeader>
      <div className="px-4 pb-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("SALE")}
            className={
              mode === "SALE"
                ? "flex-1 rounded-[10px] bg-[var(--ink)] px-3 py-2 text-[13px] font-bold text-white"
                : "flex-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[13px] font-medium"
            }
          >
            فروش
          </button>
          <button
            type="button"
            onClick={() => setMode("RENT")}
            className={
              mode === "RENT"
                ? "flex-1 rounded-[10px] bg-[var(--ink)] px-3 py-2 text-[13px] font-bold text-white"
                : "flex-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[13px] font-medium"
            }
          >
            رهن و اجاره
          </button>
        </div>

        {mode === "SALE" ? (
          <>
            <MoneyInput
              label="قیمت فروش (تومان)"
              value={price}
              onChange={(v) => setPrice(toEnDigits(v).replace(/[^0-9]/g, ""))}
              placeholder="مثلا ۱۱۵۰۰۰۰۰۰۰۰"
            />
            <div>
              <Label htmlFor="f-calcPercent">درصد کمیسیون (۰ تا ۱۰۰)</Label>
              <NumberInput
                id="f-calcPercent"
                className="mt-1"
                value={percent}
                onChange={(e) => setPercent(toEnDigits(e.target.value).replace(/[^0-9.]/g, ""))}
                placeholder="مثلا ۰٫۲۵"
                allowDecimal
              />
            </div>
          </>
        ) : (
          <>
            <MoneyInput
              label="ودیعه / رهن (تومان)"
              value={deposit}
              onChange={(v) => setDeposit(toEnDigits(v).replace(/[^0-9]/g, ""))}
              placeholder="مثلا ۱۲۰۰۰۰۰۰۰۰"
            />
            <MoneyInput
              label="اجاره ماهانه (تومان)"
              value={rent}
              onChange={(v) => setRent(toEnDigits(v).replace(/[^0-9]/g, ""))}
              placeholder="مثلا ۵۰۰۰۰۰"
            />
          </>
        )}

        {commission > 0 ? (
          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
            <div>کمیسیون (بدون مالیات): {formatToman(commission)}</div>
            <div>
              مالیات ارزش افزوده ({toFaDigits(String(DEFAULT_TAX_RATE_PCT))}٪): {formatToman(vat)}
            </div>
            <div className="font-bold">با مالیات — جمع دریافتی از مشتری: {formatToman(total)}</div>
            <div className="text-[11px] text-[var(--ink-3)]">
              {mode === "SALE"
                ? `کمیسیون = قیمت فروش × ${toFaDigits(percent || "0.25")}٪؛ مالیات فقط روی کمیسیون حساب می‌شود.`
                : `کمیسیون = ${RENT_COMMISSION_PCT}٪ اجاره ماهانه + ${RENT_COMMISSION_PCT}٪ از یک‌صدم ودیعه؛ مالیات فقط روی کمیسیون حساب می‌شود.`}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--ink-3)]">مبلغ را وارد کنید تا کمیسیون با مالیات و بدون مالیات را ببینید.</p>
        )}
      </div>
    </Card>
  );
}
