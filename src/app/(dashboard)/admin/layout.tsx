import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session || session.user.role !== "OWNER") redirect("/dashboard");
  return <>{children}</>;
}
