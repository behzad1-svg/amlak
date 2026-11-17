import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/SwRegister";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-vazir",
});

export const metadata: Metadata = {
  title: "املاک ساج — سامانه مدیریت",
  description: "سامانه مدیریت بنگاه املاک ساج بوشهر",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // سامانهٔ داخلی و خصوصی — هیچ صفحه‌ای در موتور جستجو ایندکس نشود (نقد ۱۳)
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ساج", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#145E5E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`h-full ${vazir.variable}`}>
      <head>
        {/* Next 16 فقط mobile-web-app-capable را می سازد؛ نسخهٔ قدیمی را برای iOS قدیمی دستی می گذاریم */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)] font-[var(--font-vazir)] antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
