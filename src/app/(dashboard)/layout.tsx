import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // نقد ۸ — جلسه همیشه با دیتابیس بررسی می‌شود (یک بار در هر بارگذاری صفحه):
  // پروکسی فقط امضای JWT را چک می‌کند و لغو نشست را نمی‌بیند، پس نمی‌توان
  // به هدرهای آن اعتماد کرد. این همان یک اعتبارسنجی دیتابیسی در هر صفحه است
  // (قبلاً ۳–۴ بار بود: middleware + verify + layout + useRole).
  const session = await getSessionFromCookies();
  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }
  const role = session.user.role;
  const userName = session.user.name;
  const userId = session.user.id;
  // نشان اعلان‌ها تطبیق‌ها را نمی‌شمارد؛ تطبیق نشان جداگانه خودش را دارد.
  // نشان کارت جلسه: تعداد کارت‌های در انتظار بررسی — فقط برای مدیر.
  const [unreadCount, unreadMatchCount, pendingSessionCardCount] = await Promise.all([
    prisma.notification.count({ where: { userId, read: false, type: { not: "MATCH_SUGGESTION" } } }),
    prisma.notification.count({ where: { userId, read: false, type: "MATCH_SUGGESTION" } }),
    role === "OWNER" ? prisma.sessionCard.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);
  return (
    <DashboardShell role={role} userName={userName} unreadCount={unreadCount} unreadMatchCount={unreadMatchCount} pendingSessionCardCount={pendingSessionCardCount}>
      {children}
    </DashboardShell>
  );
}
