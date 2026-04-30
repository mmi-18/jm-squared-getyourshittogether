import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Get Your Shit Together",
    template: "%s — Get Your Shit Together",
  },
  description:
    "Personal task manager built around the Eisenhower Matrix. Urgent × Important, drag-and-drop, tagged, offline-first.",
  // Linked manifest enables install-as-PWA on Android / Chrome / Edge.
  manifest: "/manifest.webmanifest",
  // iOS doesn't read the manifest; these meta tags drive standalone mode +
  // home-screen icon + status-bar tone when added via Safari → Share → Add
  // to Home Screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GYST",
  },
  applicationName: "Get Your Shit Together",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  // Mobile-first; allow content under the iOS notch (paired with our
  // safe-area-inset paddings in components).
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
