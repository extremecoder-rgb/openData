import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenData AI — Preprocessing Engine",
  description: "Turn messy CSV data into ML-ready datasets in seconds with AI-powered preprocessing, RL agents, and full audit trails.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
