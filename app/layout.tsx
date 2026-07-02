import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppBackground } from "@/components/app-background";
import PWARegister from "@/components/pwa-register";
import DesktopNotify from "@/components/desktop-notify";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://losesperados.fr"),
  title: "Los Esperados | Panel Interne",
  description: "Famille Los Esperados",
  icons: {
    // Favicon multi-tailles généré depuis branding/los-esperados.png
    // (16/32/48/64/128/256). On NE référence PLUS /logo-icon.svg car ce
    // fichier contenait un placeholder "LE" hérité, et Chrome préférant le
    // SVG, l'onglet affichait "LE" au lieu du vrai logo Los Esperados.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/los-esperados.png", type: "image/png", sizes: "256x256" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  // PWA / iOS : permet l'installation en plein écran avec le bon titre.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Los Esperados",
  },
  // Open Graph — utilisé par Discord/Slack/Twitter pour le preview de lien.
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://losesperados.fr",
    siteName: "Los Esperados",
    title: "🏛️ Los Esperados — Panel Interne",
    description: "Famille Los Esperados",
    images: [
      {
        url: "/branding/los-esperados.png",
        width: 1024,
        height: 1024,
        alt: "Los Esperados",
      },
    ],
  },
  // Twitter card — Discord lit aussi ces tags pour décider du type de
  // preview (summary_large_image = grosse image, summary = mini-thumb).
  twitter: {
    card: "summary_large_image",
    title: "🏛️ Los Esperados — Panel Interne",
    description: "Famille Los Esperados",
    images: ["/branding/los-esperados.png"],
  },
};

// Couleur de la barre verticale de l'embed Discord (rouge bordeaux famille).
export const viewport: Viewport = {
  themeColor: "#9b2335",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased min-h-screen`}
        id="app-v4-canvas-theme"
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('perf-lite')==='1')document.documentElement.classList.add('perf-lite')}catch(e){}",
          }}
        />
        <AppBackground />
        <PWARegister />
        <DesktopNotify />
        {children}
      </body>
    </html>
  );
}
