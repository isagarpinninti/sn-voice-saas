import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ZeVox | AI Voice Agents for ServiceNow — A ZeTechno Product",
  description: "Enterprise-grade voice AI for ServiceNow by ZeTechno. Human-quality conversations, 100% managed from your ServiceNow instance.",
  keywords: "ServiceNow, voice agent, AI, conversational AI, IT support, ZeTechno, ZeVox",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}

