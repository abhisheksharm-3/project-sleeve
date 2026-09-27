import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

/** One family, used at real optical sizes, carries the whole interface. */
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "ProjectSleeve",
  description: "Keep-alive that actually works for free-tier backends.",
  openGraph: { siteName: "ProjectSleeve", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
