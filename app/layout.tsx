export const metadata = {
  title: "Creative Promo Agent",
  description: "Turn a link or vibe brief into a mini press kit + moodboard",
  };
  
  
  export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
  <html lang="en" suppressHydrationWarning>
  <body className="min-h-screen">
  {children}
  </body>
  </html>
  );
  }