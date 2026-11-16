import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // نقد ۸ — جلسه همیشه با دیتابیس بررسی می‌شود (یک بار در هر بارگذاری صفحه):
  // پروکسی فقط امضای JWT را چک می‌کند و لغو نشست را نمی‌بیند، پس نمی‌توان
  // به هدرهای آن اعتماد کرد. این همان یک اعتبارسنجی دیتابیسی در هر صفحه است
  // (قبلاً ۳–۴ بار بود: middleware + verify + layout + useRole).
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session) redirect("/login");
  const role = session.user.role;
  const userName = session.user.name;
  const userId = session.user.id;
  const unreadCount = await prisma.notification.count({ where: { userId, read: false } });
  return (
    <DashboardShell role={role} userName={userName} unreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}
