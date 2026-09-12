import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-vazir",
});

export const metadata: Metadata = {
  title: "املاک ساج — سامانه مدیریت",
  description: "سامانه مدیریت بنگاه املاک ساج بوشهر",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`h-full ${vazir.variable}`}>
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)] font-[var(--font-vazir)] antialiased">
        {children}
      </body>
    </html>
  );
}
