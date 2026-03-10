import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "./components/ToastContext";
import { NavigationProvider } from "./components/NavigationContext";
import NavBar from "./components/NavBar";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zillow Scraper",
  description: "Scrape Zillow for-sale listings with sold comps",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <ToastProvider>
          <NavigationProvider>
            <NavBar />
            {children}
          </NavigationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
