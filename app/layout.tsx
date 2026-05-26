import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'בוט לימוד | Immigrant Study Bot',
  description: 'מערכת לימוד דו-לשונית לעולים חדשים לקראת בגרות',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, padding: 0, background: '#0f1923' }}>
        {children}
      </body>
    </html>
  );
}
