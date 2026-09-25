import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";

export default function DealsPage() {
  return (
    <div>
      <Header title="معاملات" subtitle="این بخش فعلاً از منو حذف شده" />
      <div className="p-6 max-w-md">
        <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
          <div className="text-[14px] font-bold">بخش معاملات موقتاً غیرفعال است</div>
          <div className="mt-2 text-[13px] leading-6 text-[var(--ink-3)]">
            موفقیت مشتری از پرونده مشتری ثبت می‌شود و فایل مربوطه بایگانی می‌شود.
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/customers"><Button variant="outline">مشتریان</Button></Link>
            <Link href="/properties"><Button variant="outline">فایل‌ها</Button></Link>
            <Link href="/dashboard"><Button>داشبورد</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
