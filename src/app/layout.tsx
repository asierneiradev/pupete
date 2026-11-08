import type { Metadata, Viewport } from "next";
import { Doto, Fraunces, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { Scenery } from "@/components/Scenery";
import { Header } from "@/components/Header";

const doto = Doto({ subsets: ["latin"], variable: "--font-doto", axes: ["ROND"], display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-spacemono", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", style: ["italic"], axes: ["SOFT", "WONK"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Pupete · Amigo invisible", template: "%s · Pupete" },
  description: "El amigo invisible de la familia: listas de deseos, sorteo justo y sorpresas de verdad.",
  applicationName: "Pupete",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pupete", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f0e1",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${doto.variable} ${grotesk.variable} ${mono.variable} ${fraunces.variable}`}>
      <body>
        <Scenery />
        <div className="relative z-10 flex min-h-dvh flex-col">
          <Header />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-40 pt-4 sm:px-6">{children}</main>
          <footer className="relative z-10 pb-6 text-center no-print">
            <span className="card-soft inline-block rounded-full px-4 py-1.5 font-mono text-[0.7rem] tracking-[0.2em] text-ink-soft">
              ● HECHO CON CARIÑO · PUPETE
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
