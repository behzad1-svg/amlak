"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, UserPlus } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/customers")
      .then(res => res.json())
      .then(data => {
        setCustomers(data)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  const translateType = (t: string) => {
    const map: any = { BUYER: "خریدار", SELLER: "فروشنده", TENANT: "مستاجر" }
    return map[t] || t
  }

  const translateTemp = (t: string) => {
    const map: any = { HOT: "داغ", WARM: "گرم", COLD: "سرد" }
    return map[t] || t
  }

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
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  در حال بارگذاری...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  هیچ مشتری یافت نشد.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{c.name}</td>
                  <td className="px-6 py-4 dir-ltr text-right">{c.phone}</td>
                  <td className="px-6 py-4">{translateType(c.type)}</td>
                  <td className="px-6 py-4">
                    {c.budgetMax ? `تا ${c.budgetMax.toLocaleString()} تومان` : 'نامشخص'}
                    {c.preferredArea ? ` / ${c.preferredArea}` : ''}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                      {translateTemp(c.temperature)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {c.nextFollowUpAt ? new Date(c.nextFollowUpAt).toLocaleDateString('fa-IR') : 'نامشخص'}
                  </td>
                  <td className="px-6 py-4">
                    <Button variant="ghost" size="sm" className="text-primary">پروفایل</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
