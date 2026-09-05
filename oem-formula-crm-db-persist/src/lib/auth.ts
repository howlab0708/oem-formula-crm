/**
 * 공용 비밀번호 한 개로 앱 전체를 막는 최소 인증.
 *
 * 사람별 계정이 필요 없는 사내 도구라 세션 저장소를 두지 않는다. 대신 비밀번호로
 * 서명한 값을 쿠키에 넣고, 요청마다 같은 값을 다시 계산해 맞춰 본다.
 * 비밀번호를 모르면 쿠키를 위조할 수 없고, 쿠키에 비밀번호 자체는 들어가지 않는다.
 */

export const AUTH_COOKIE = 'oem_auth'
/** 쿠키 유효기간 30일 */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30

/** 서명 대상 문자열. 바꾸면 기존 쿠키가 전부 무효가 된다. */
const PAYLOAD = 'oem-crm-gate-v1'

const encoder = new TextEncoder()

/** 비밀번호로 HMAC-SHA256 서명값(16진수)을 만든다. Edge/Node 양쪽에서 되는 Web Crypto 사용. */
export async function tokenFor(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(PAYLOAD))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 길이가 같은 문자열의 상수 시간 비교. 앞자리부터 맞춰 보는 공격을 막는다. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * 로그인 후 돌아갈 경로. 외부 주소로 튕겨 보내는 열린 리다이렉트를 막기 위해
 * 우리 사이트 안의 절대경로만 통과시킨다.
 */
export function safeNextPath(raw: string | undefined | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
