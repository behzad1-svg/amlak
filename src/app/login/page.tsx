"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const [mobile, setMobile] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile, password })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "خطا در ورود")
      }

      router.push("/dashboard")
      router.refresh()
    } catch (error: any) {
      alert(error.message || "اطلاعات ورود اشتباه است.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50" dir="rtl">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">ورود به سیستم املاک</h1>
          <p className="text-sm text-gray-500 mt-2">لطفاً شماره موبایل و رمز عبور خود را وارد کنید.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">شماره موبایل</label>
            <Input
              type="tel"
              placeholder="0912..."
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
              className="text-left dir-ltr"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">رمز عبور</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="text-left dir-ltr"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "در حال ورود..." : "ورود"}
          </Button>
        </form>
      </div>
    </div>
  )
}
