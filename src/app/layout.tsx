import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";

const display = Unbounded({ subsets: ["latin"], variable: "--font-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Monad Sperm Race",
  description: "A spectator race on Monad testnet. Qualify with your on-chain history, claim a ticket, watch your racer.",
};

export const viewport: Viewport = {
  themeColor: "#0A0714",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
