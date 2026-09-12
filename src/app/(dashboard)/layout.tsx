import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session) redirect("/login");
  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, read: false } });
  return (
    <DashboardShell role={session.user.role} unreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}
