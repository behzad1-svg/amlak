import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

// async + headers() یعنی رندر داینامیک برای همهٔ صفحات — برای nonce لازم است:
// پروکسی برای هر درخواست nonce تازه می‌سازد و Next.js آن را به اسکریپت‌های
// خودش می‌زند؛ اسکریپت تم (تنها اسکریپت اینلاین پروژه) nonce را از x-nonce می‌گیرد.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <html lang="fa" dir="rtl" className={`h-full ${vazir.variable}`} suppressHydrationWarning>
      <head>
        {/* Next 16 فقط mobile-web-app-capable را می سازد؛ نسخهٔ قدیمی را برای iOS قدیمی دستی می گذاریم */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* تم ذخیره شده را پیش از اولین رندر اعمال می کند تا چشمک تم رخ ندهد (کلید: saj-theme — src/lib/theme.ts) */}
        <script
          nonce={nonce ?? undefined}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("saj-theme");if(t==="dark"){document.documentElement.setAttribute("data-theme","dark");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)] font-[var(--font-vazir)] antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
