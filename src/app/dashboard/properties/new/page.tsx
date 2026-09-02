"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function NewPropertyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    type: "APARTMENT",
    dealType: "SALE",
    salePriceToman: "",
    depositToman: "",
    monthlyRentToman: "",
    sizeSqm: "",
    region: "",
    address: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload: any = {
        title: formData.title,
        type: formData.type,
        dealType: formData.dealType,
        region: formData.region,
        address: formData.address,
      }

      if (formData.sizeSqm) payload.sizeSqm = Number(formData.sizeSqm)

      if (formData.dealType === 'SALE') {
        payload.salePriceToman = formData.salePriceToman
      } else {
        payload.depositToman = formData.depositToman
        payload.monthlyRentToman = formData.monthlyRentToman
      }

      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "خطا در ثبت فایل")
      }

      alert("فایل با موفقیت ثبت شد!")
      router.push("/dashboard/properties")
      router.refresh()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 bg-white p-8 rounded-lg border shadow-sm">
      <h2 className="text-2xl font-bold border-b pb-4">ثبت فایل جدید</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">عنوان فایل</label>
          <Input
            required
            placeholder="مثال: آپارتمان ۱۰۰ متری نوساز"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع ملک</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.type}
              onChange={e => setFormData({...formData, type: e.target.value})}
            >
              <option value="APARTMENT">آپارتمان</option>
              <option value="VILLA">ویلا / حیاط‌دار</option>
              <option value="OFFICE">دفتر کار</option>
              <option value="SHOP">مغازه / تجاری</option>
              <option value="LAND">زمین / کلنگی</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نوع معامله</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.dealType}
              onChange={e => setFormData({...formData, dealType: e.target.value})}
            >
              <option value="SALE">فروش</option>
              <option value="RENT">رهن و اجاره</option>
            </select>
          </div>
        </div>

        {formData.dealType === 'SALE' ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">قیمت فروش (تومان)</label>
            <Input
              type="number"
              required
              value={formData.salePriceToman}
              onChange={e => setFormData({...formData, salePriceToman: e.target.value})}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">مبلغ رهن (تومان)</label>
              <Input
                type="number"
                required
                value={formData.depositToman}
                onChange={e => setFormData({...formData, depositToman: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">مبلغ اجاره (تومان)</label>
              <Input
                type="number"
                required
                value={formData.monthlyRentToman}
                onChange={e => setFormData({...formData, monthlyRentToman: e.target.value})}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">متراژ (متر مربع)</label>
            <Input
              type="number"
              value={formData.sizeSqm}
              onChange={e => setFormData({...formData, sizeSqm: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">منطقه / محله</label>
            <Input
              required
              value={formData.region}
              onChange={e => setFormData({...formData, region: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">آدرس دقیق</label>
          <Input
            value={formData.address}
            onChange={e => setFormData({...formData, address: e.target.value})}
          />
        </div>

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>انصراف</Button>
          <Button type="submit" disabled={loading}>
            {loading ? "در حال ثبت..." : "ثبت فایل"}
          </Button>
        </div>
      </form>
    </div>
  )
}
