import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, safeEqual, tokenFor } from '@/lib/auth'

/**
 * 앱 전체 비밀번호 잠금.
 *
 * 환경변수 APP_PASSWORD 가 있어야 통과 쿠키를 검증한다.
 * 운영에서 이 변수를 빠뜨리면 열어 두는 대신 안내 화면으로 보낸다 - 잠갔다고 믿는
 * 사이 공개돼 있는 상황이 가장 나쁘다. 로컬 개발에서는 변수 없이 그냥 쓴다.
 */

const PUBLIC_PATHS = new Set(['/login', '/api/login'])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const password = process.env.APP_PASSWORD

  if (!password) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    return NextResponse.redirect(loginUrl(request, { setup: '1' }))
  }

  const presented = request.cookies.get(AUTH_COOKIE)?.value
  if (presented && safeEqual(presented, await tokenFor(password))) {
    return NextResponse.next()
  }

  return NextResponse.redirect(loginUrl(request, pathname === '/' && !request.nextUrl.searchParams.has('saved') ? {} : { next: pathname + request.nextUrl.search }))
}

function loginUrl(request: NextRequest, params: Record<string, string>): URL {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

export const config = {
  // 정적 자산은 그대로 통과시킨다. 막으면 로그인 화면의 CSS 조차 못 불러온다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
