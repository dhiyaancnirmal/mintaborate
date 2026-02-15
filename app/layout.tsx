import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mintaborate",
  description: "Agent-readiness testing for Mintlify documentation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
