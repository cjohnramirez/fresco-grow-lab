import type { Metadata } from "next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: "Fresco Grow Lab",
  description:
    "Grow-bag temperature and rain gauge telemetry built for Fresco Greenovations Inc., an agritech startup in Cagayan de Oro City. Runs on simulated data or your own ESP32 sensors.",
  authors: [{ name: "John Carl Ramirez" }],
  creator: "John Carl Ramirez",
  publisher: "Fresco Greenovations Inc.",
  openGraph: {
    title: "Fresco Grow Lab",
    description:
      "Grow-bag temperature and rain gauge telemetry built for Fresco Greenovations Inc., Cagayan de Oro City.",
    type: "website",
    images: [
      {
        url: "/screenshot.png",
        width: 1200,
        height: 630,
        alt: "Fresco Grow Lab dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fresco Grow Lab",
    description:
      "Grow-bag temperature and rain gauge telemetry built for Fresco Greenovations Inc., Cagayan de Oro City.",
    images: ["/screenshot.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full font-sans antialiased"
    >
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
