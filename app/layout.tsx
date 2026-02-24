import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Buttery Smooth Jamming',
  description: 'AI-assisted live coding music with Strudel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
