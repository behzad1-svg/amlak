import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";

export default function TasksPage() {
  return (
    <div>
      <Header title="وظایف" subtitle="این بخش فعلاً از منو حذف شده" />
      <div className="p-6 max-w-md">
        <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
          <div className="text-[14px] font-bold">بخش وظایف موقتاً غیرفعال است</div>
          <div className="mt-2 text-[13px] leading-6 text-[var(--ink-3)]">
            برای پیگیری از مشتریان و داشبورد استفاده کنید.
          </div>
          <Link href="/dashboard" className="mt-4 inline-block">
            <Button variant="outline">بازگشت به داشبورد</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
