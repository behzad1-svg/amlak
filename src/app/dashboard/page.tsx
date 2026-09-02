import { Home } from "lucide-react"

export default function DashboardPage() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-gray-500 text-sm mb-2">کل فایل‌ها</div>
          <div className="text-3xl font-bold">120</div>
        </div>
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-gray-500 text-sm mb-2">مشتریان فعال</div>
          <div className="text-3xl font-bold">45</div>
        </div>
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-gray-500 text-sm mb-2">مچ‌های جدید</div>
          <div className="text-3xl font-bold text-green-600">12</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <h2 className="font-semibold text-lg mb-4">آخرین فعالیت‌ها</h2>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 pb-4 border-b last:border-0 last:pb-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Home className="w-5 h-5" />
              </div>
              <div>
                <div className="font-medium">ثبت فایل جدید: آپارتمان ۱۰۰ متری سعادت‌آباد</div>
                <div className="text-sm text-gray-500">۲ ساعت پیش توسط ادمین</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
