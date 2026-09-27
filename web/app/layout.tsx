import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

/** One family carries the whole interface: narrow enough for dense rows, with even figures. */
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "ProjectSleeve",
  description: "Keep-alive that actually works for free-tier backends.",
  openGraph: { siteName: "ProjectSleeve", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
