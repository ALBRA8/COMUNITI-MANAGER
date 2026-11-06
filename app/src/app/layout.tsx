import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "COMUNITI-MANAGER — Arnés de community management",
  description: "Arnés de community management para Facebook Groups: HITL real, motor de cumplimiento Meta de 6 estados y honestidad de estados.",
  keywords: ["community management", "Facebook Groups", "Meta Policy", "HITL", "anti-ban"],
  openGraph: {
    title: "COMUNITI-MANAGER — Arnés de community management",
    description: "HITL real, motor de cumplimiento Meta y honestidad de estados.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
