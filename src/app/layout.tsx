import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tier List Gen",
  description: "ChatGPT-authenticated tier-list image generation prototype",
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

