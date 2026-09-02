import { Button } from "@/components/ui/button"
import { Users, Home, Settings, LogOut, LayoutDashboard } from "lucide-react"
import Link from "next/link"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const session = cookieStore.get('session_token')

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen w-full bg-gray-100" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-l flex flex-col">
        <div className="h-16 flex items-center justify-center border-b font-bold text-lg">
          سیستم مدیریت املاک
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md">
            <LayoutDashboard className="w-5 h-5" />
            داشبورد
          </Link>
          <Link href="/dashboard/properties" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md">
            <Home className="w-5 h-5" />
            فایل‌ها
          </Link>
          <Link href="/dashboard/customers" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md">
            <Users className="w-5 h-5" />
            مشتریان
          </Link>
          <Link href="/dashboard/settings" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md">
            <Settings className="w-5 h-5" />
            تنظیمات
          </Link>
        </nav>
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full flex justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50" asChild>
            <Link href="/login">
              <LogOut className="w-5 h-5" />
              خروج
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center px-8 justify-between">
          <h1 className="font-semibold text-xl">داشبورد</h1>
          <div className="text-sm text-gray-500">خوش آمدید، کاربر تست</div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
