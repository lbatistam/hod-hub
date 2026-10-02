import type { Metadata } from "next";
import "./globals.css";
import {MotionProvider} from "@/components/apps-motion";

export const metadata: Metadata = {
  title: "HOD Hub · Consultorias",
  description: "Central privada de consultorias da Home Office Digital.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true,title:"HOD Hub",statusBarStyle:"default"},
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg?v=2",
    apple: [{url:"/hod-icon-180-v1.png",sizes:"180x180",type:"image/png"}],
    shortcut: "/favicon.svg?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased"><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
