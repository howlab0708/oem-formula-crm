import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '건기식 OEM 배합비 솔루션',
  description:
    '건강기능식품 OEM 영업팀을 위한 처방 레퍼런스 검색 · 시장 배합 분석 · 고객 브리핑 도구',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f2f2f3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  )
}
