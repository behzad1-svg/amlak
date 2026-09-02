"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, UserPlus } from "lucide-react"
import Link from "next/link"

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">مدیریت مشتریان</h2>
        <Button className="flex items-center gap-2" asChild><Link href="/dashboard/customers/new"><UserPlus className="w-4 h-4" />ثبت مشتری جدید</Link></Button>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="جستجو نام یا شماره موبایل..." className="pr-10" />
        </div>
        <Button variant="outline">فیلترها</Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 font-medium">نام مشتری</th>
              <th className="px-6 py-4 font-medium">شماره تماس</th>
              <th className="px-6 py-4 font-medium">نوع تقاضا</th>
              <th className="px-6 py-4 font-medium">بودجه / منطقه</th>
              <th className="px-6 py-4 font-medium">درجه اهمیت</th>
              <th className="px-6 py-4 font-medium">وضعیت پیگیری</th>
              <th className="px-6 py-4 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[1, 2, 3].map((i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">علی محمدی</td>
                <td className="px-6 py-4 dir-ltr text-right">0912 345 6789</td>
                <td className="px-6 py-4">خریدار آپارتمان</td>
                <td className="px-6 py-4">تا ۱۵ میلیارد / سعادت‌آباد</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">داغ (Hot)</span>
                </td>
                <td className="px-6 py-4 text-gray-500">نیاز به تماس امروز</td>
                <td className="px-6 py-4">
                  <Button variant="ghost" size="sm" className="text-blue-600">پروفایل</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
