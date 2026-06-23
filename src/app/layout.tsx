import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hệ thống Hỗ trợ Chẩn đoán YHCT | XAI-CDSS',
  description:
    'Hệ thống hỗ trợ chẩn đoán hội chứng Y học cổ truyền dựa trên cơ sở tri thức kết hợp AI có khả năng giải thích (Explainable AI)',
  keywords: ['YHCT', 'Y học cổ truyền', 'chẩn đoán', 'hội chứng', 'AI', 'XAI'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
