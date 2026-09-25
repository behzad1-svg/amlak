import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";

export default function ViewingsPage() {
  return (
    <div>
      <Header title="بازدیدها" subtitle="این بخش از منو حذف شده" />
      <div className="p-6 max-w-md">
        <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center">
          <div className="text-[14px] font-bold">بازدید جداگانه لازم نیست</div>
          <div className="mt-2 text-[13px] leading-6 text-[var(--ink-3)]">
            بازدید را داخل <b>پرونده مشتری</b> یا <b>صفحه فایل</b> ثبت کنید — تاریخ، مشاور و گزارش همان‌جا می‌ماند.
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
