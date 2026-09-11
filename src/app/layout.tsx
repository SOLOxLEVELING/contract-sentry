import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContractSentry — Autonomous Invoice Compliance Agent',
  description: 'AI-powered vendor invoice auditing against SOW terms using Strands SDK & Amazon Bedrock.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
