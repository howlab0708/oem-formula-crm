import type { Metadata, Viewport } from 'next'
import './globals.css'
import { pageTitle } from '@/lib/deployment'

export const metadata: Metadata = {
  // 배포마다 회사 이름표가 앞에 붙는다(APP_LABEL). 탭을 여러 개 열어도 구분된다.
  title: pageTitle(),
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
