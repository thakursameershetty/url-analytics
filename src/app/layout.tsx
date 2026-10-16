import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
            <div className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-full px-3.5 py-1.5 text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                Links
              </Link>
              <Link href="/analytics" className="rounded-full px-3.5 py-1.5 text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                Analytics
              </Link>
              <Link href="/heatmaps" className="rounded-full px-3.5 py-1.5 text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                Heatmaps
              </Link>
              <Link href="/sites" className="rounded-full px-3.5 py-1.5 text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                Sites
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
