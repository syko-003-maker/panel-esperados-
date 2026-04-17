import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppBackground } from "@/components/app-background";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
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
        className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased min-h-screen`}
        id="app-v4-canvas-theme"
      >
        <AppBackground />
        {children}
      </body>
    </html>
  );
}
