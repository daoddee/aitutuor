export const metadata = {
  title: "Maths & Engineering AI Agent",
  description: "OCR → Retrieve → Compute → Explain"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* If you add Tailwind, import a global stylesheet here: */}
      {/* <link rel="stylesheet" href="/styles/globals.css" /> */}
      <body>{children}</body>
    </html>
  );
}
