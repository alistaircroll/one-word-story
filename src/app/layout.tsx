import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google"; // Using Inter and Merriweather as per spec
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-merriweather"
});

export const metadata: Metadata = {
  title: "One Word Story",
  description: "A Jackbox-style collaborative storytelling party game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${merriweather.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
