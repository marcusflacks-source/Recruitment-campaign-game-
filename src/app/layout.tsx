import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "betterhomes — break the ceiling",
  description:
    "Trust better. Get better. Play the betterhomes broker climber and see how high your career can go.",
  openGraph: {
    title: "betterhomes — break the ceiling",
    description: "Trust better. Get better.",
    type: "website",
  },
  // Brand name is always lowercase.
  applicationName: "betterhomes",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1F343F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
