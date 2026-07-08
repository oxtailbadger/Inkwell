import type { Metadata } from "next";
import { Work_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

// Work Sans replaced Space Grotesk as the primary UI font in the "Broadsheet"
// redesign (2026-07-08 design handoff). Cormorant Garamond's role inverted at
// the same time: it's no longer used for headlines, only for small-caps
// meta/eyebrow text (site names, section labels, dates, tags) — see
// DECISIONS.md.
const workSans = Work_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Inkwell",
  description: "Articles worth reading, shared by friends.",
  appleWebApp: {
    capable: true,
    title: "Inkwell",
    statusBarStyle: "default",
  },
};

// Reads the persisted theme before first paint so there's no flash of the
// wrong theme. Runs as a blocking inline script during HTML parsing — see
// node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
// data-theme is explicit (user toggle + localStorage), not
// prefers-color-scheme, per the design handoff's instruction that the app
// controls theme rather than following the OS setting.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("inkwell-theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${workSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
