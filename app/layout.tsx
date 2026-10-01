import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sales Call Copilot · Recall.ai demo",
  description: "Send a Recall.ai bot to a sales call for a live transcript, talk-time coaching, and a CRM-ready summary.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-sm text-white">SC</span>
              Sales Call Copilot
            </Link>
            <a
              href="https://docs.recall.ai"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-zinc-500 hover:text-zinc-900"
            >
              Built on Recall.ai
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
