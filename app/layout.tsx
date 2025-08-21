import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../src/contexts/AuthContext";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "../src/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Video Editor Pro - AI-Powered Video Editing",
  description: "Professional video editing tool with AI analysis and enhancement capabilities",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          <AuthProvider>
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#1f2937',
                  color: '#f3f4f6',
                  border: '1px solid #374151',
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#f3f4f6',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#f3f4f6',
                  },
                },
              }}
            />
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
