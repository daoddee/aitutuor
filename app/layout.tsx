import "../styles/globals.css";

export const metadata = {
  title: "Maths & Engineering AI Agent",
  description: "OCR → Retrieve → Compute → Explain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
