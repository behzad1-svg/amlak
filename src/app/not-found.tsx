import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-8 text-center">
      <div className="text-[18px] font-extrabold">این صفحه پیدا نشد</div>
      <p className="mt-2 text-[13px] text-[var(--ink-3)]">آدرس اشتباه است یا صفحه حذف شده است.</p>
      <Link href="/dashboard" className="mt-4 inline-block rounded-[12px] bg-[var(--pomegranate)] px-4 py-2 text-[13.5px] font-medium text-white">
        بازگشت به داشبورد
      </Link>
    </div>
  );
}
