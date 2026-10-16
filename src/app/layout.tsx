import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import NavLinks from "@/components/NavLinks";
import { authMode } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "URL Shortener",
  description: "Shorten links, generate QR codes, and see who clicks — by place, device, browser and source.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Browser extensions inject attributes on <html> before hydration; only this element is exempted.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-end px-4 sm:px-6">
            <Suspense>
              <NavLinks showSignOut={authMode() === 'on'} />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
