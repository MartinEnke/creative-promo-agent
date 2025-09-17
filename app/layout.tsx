// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Creative Promo Agent',
  description: 'AI-powered promo kit generator for music releases',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} app-bg text-base text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
