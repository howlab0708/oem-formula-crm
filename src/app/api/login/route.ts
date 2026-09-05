import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, AUTH_MAX_AGE, safeEqual, safeNextPath, tokenFor } from '@/lib/auth'

/**
 * 로그인 폼 제출을 받는다. 자바스크립트 없이 순수 form POST 로 동작한다.
 * 입력값과 정답을 각각 서명해 같은 길이로 만든 뒤 상수 시간 비교한다.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const submitted = String(form.get('password') ?? '')
  const next = safeNextPath(String(form.get('next') ?? '/'))
  const password = process.env.APP_PASSWORD

  const url = request.nextUrl.clone()
  url.search = ''

  const ok =
    Boolean(password) &&
    safeEqual(await tokenFor(submitted), await tokenFor(password as string))

  if (!ok) {
    url.pathname = '/login'
    url.searchParams.set('error', '1')
    if (next !== '/') url.searchParams.set('next', next)
    return NextResponse.redirect(url, { status: 303 })
  }

  url.pathname = next
  const response = NextResponse.redirect(url, { status: 303 })
  response.cookies.set({
    name: AUTH_COOKIE,
    value: await tokenFor(password as string),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_MAX_AGE,
  })
  return response
}
