import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Los Esperados | Panel Interne",
  description: "Panel de gestion interne Los Esperados - Membres, Sanctions, Banque, Staff",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/los-esperados.png", type: "image/png", sizes: "256x256" },
      { url: "/logo-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/branding/los-esperados.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900/20`}
      >
        {children}
      </body>
    </html>
  );
}
