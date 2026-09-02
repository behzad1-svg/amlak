"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus } from "lucide-react"

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">مدیریت فایل‌ها</h2>
        <Button className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          ثبت فایل جدید
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="جستجو در فایل‌ها..." className="pr-10" />
        </div>
        <Button variant="outline">فیلترها</Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 font-medium">کد فایل</th>
              <th className="px-6 py-4 font-medium">عنوان</th>
              <th className="px-6 py-4 font-medium">نوع / معامله</th>
              <th className="px-6 py-4 font-medium">قیمت (تومان)</th>
              <th className="px-6 py-4 font-medium">متراژ</th>
              <th className="px-6 py-4 font-medium">وضعیت</th>
              <th className="px-6 py-4 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[1, 2, 3].map((i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-blue-600">#{1000 + i}</td>
                <td className="px-6 py-4">آپارتمان نوساز سعادت‌آباد</td>
                <td className="px-6 py-4">آپارتمان / فروش</td>
                <td className="px-6 py-4">15,000,000,000</td>
                <td className="px-6 py-4">120 متر</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">فعال</span>
                </td>
                <td className="px-6 py-4">
                  <Button variant="ghost" size="sm" className="text-blue-600">مشاهده</Button>
                </td>
              </tr>
            ))}
            {/* Empty state fallback if no data */}
            {/* <tr>
              <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                هیچ فایلی یافت نشد.
              </td>
            </tr> */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
