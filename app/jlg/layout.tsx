import { Cinzel, Cormorant_Garamond } from "next/font/google";

// Fonts spécifiques à la page Technique J.L.G — chargées ICI uniquement
// (pas dans le root layout, pour ne pas alourdir le reste du panel).
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export default function JlgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cinzel.variable} ${cormorant.variable}`}>{children}</div>
  );
}
