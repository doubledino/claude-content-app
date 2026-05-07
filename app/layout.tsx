import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Weekly TikTok Trend Dashboard",
  description: "Personal trainer content service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
