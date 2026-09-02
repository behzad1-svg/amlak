"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function NewCustomerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Set default follow up to tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    type: "BUYER",
    preferredDealType: "SALE",
    preferredType: "APARTMENT",
    preferredArea: "",
    budgetMin: "",
    budgetMax: "",
    nextFollowUpAt: tomorrow.toISOString().slice(0, 16) // Format for datetime-local
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload: any = {
        name: formData.name,
        phone: formData.phone,
        type: formData.type,
        preferredDealType: formData.preferredDealType,
        preferredType: formData.preferredType,
      }

      if (formData.preferredArea) payload.preferredArea = formData.preferredArea
      if (formData.budgetMin) payload.budgetMin = formData.budgetMin
      if (formData.budgetMax) payload.budgetMax = formData.budgetMax

      // Ensure the datetime is converted to full ISO format string
      if (formData.nextFollowUpAt) {
        payload.nextFollowUpAt = new Date(formData.nextFollowUpAt).toISOString()
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "خطا در ثبت مشتری")
      }

      alert("مشتری با موفقیت ثبت شد!")
      router.push("/dashboard/customers")
      router.refresh()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 bg-white p-8 rounded-lg border shadow-sm">
      <h2 className="text-2xl font-bold border-b pb-4">ثبت مشتری جدید</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">نام مشتری</label>
            <Input
              required
              placeholder="مثال: علی محمدی"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">شماره تماس</label>
            <Input
              type="tel"
              required
              className="dir-ltr text-right"
              placeholder="09123456789"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع مشتری</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.type}
              onChange={e => setFormData({...formData, type: e.target.value})}
            >
              <option value="BUYER">خریدار</option>
              <option value="TENANT">مستاجر</option>
              <option value="SELLER">فروشنده</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نوع معامله درخواستی</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.preferredDealType}
              onChange={e => setFormData({...formData, preferredDealType: e.target.value})}
            >
              <option value="SALE">فروش</option>
              <option value="RENT">رهن و اجاره</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 border rounded-md p-4 bg-gray-50">
          <h3 className="font-medium text-sm text-gray-700 mb-2">ترجیحات ملک (اختیاری)</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">نوع ملک</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                value={formData.preferredType}
                onChange={e => setFormData({...formData, preferredType: e.target.value})}
              >
                <option value="APARTMENT">آپارتمان</option>
                <option value="VILLA">ویلا / حیاط‌دار</option>
                <option value="OFFICE">دفتر کار</option>
                <option value="SHOP">مغازه / تجاری</option>
                <option value="LAND">زمین / کلنگی</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">منطقه / محله مورد نظر</label>
              <Input
                value={formData.preferredArea}
                onChange={e => setFormData({...formData, preferredArea: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">حداقل بودجه (تومان)</label>
              <Input
                type="number"
                value={formData.budgetMin}
                onChange={e => setFormData({...formData, budgetMin: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">حداکثر بودجه (تومان)</label>
              <Input
                type="number"
                value={formData.budgetMax}
                onChange={e => setFormData({...formData, budgetMax: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">تاریخ پیگیری بعدی</label>
          <Input
            type="datetime-local"
            required
            value={formData.nextFollowUpAt}
            onChange={e => setFormData({...formData, nextFollowUpAt: e.target.value})}
          />
        </div>

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>انصراف</Button>
          <Button type="submit" disabled={loading}>
            {loading ? "در حال ثبت..." : "ثبت مشتری"}
          </Button>
        </div>
      </form>
    </div>
  )
}
