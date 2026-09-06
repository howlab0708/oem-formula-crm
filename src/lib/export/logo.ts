'use client'

export async function readLogo(file: File): Promise<string> {
  if (!['image/png','image/jpeg'].includes(file.type) || file.size > 2*1024*1024) throw new Error('2MB 이하 PNG·JPG 로고를 선택해 주세요.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('로고 이미지를 읽지 못했습니다.') })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height > 20000000) throw new Error('로고는 2천만 화소 이하 이미지를 사용해 주세요.')
    const scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width*scale)); canvas.height = Math.max(1, Math.round(bitmap.height*scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('로고를 처리하지 못했습니다.')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { bitmap.close() }
}

/*
 * 로고는 기기별 설정이다. 영업 담당자가 접속할 때마다 다시 올리지 않도록
 * 이 브라우저에만 남긴다. 서버·데이터베이스로는 보내지 않는다.
 */
const STORAGE_KEY = 'oem-crm.export-logo'

/*
 * 읽은 값을 붙들어 둔다. 로고는 수십만 자의 data URL 이고 useSyncExternalStore 의
 * 스냅숏으로 쓰이므로, 매 렌더마다 저장소를 다시 읽지 않고 같은 문자열을 돌려준다.
 */
let cached: string | null | undefined

/** 저장해 둔 로고. 사생활 보호 모드처럼 저장소를 못 읽는 환경에서는 null 이다. */
export function loadStoredLogo(): string | null {
  if (cached !== undefined) return cached
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    cached = value && value.startsWith('data:image/png;base64,') ? value : null
  } catch { cached = null }
  return cached
}

/** 저장에 성공했는지 돌려준다. 실패해도 이번 화면의 내보내기에는 그대로 쓴다. */
export function storeLogo(dataUrl: string | null): boolean {
  cached = dataUrl
  try {
    if (dataUrl === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, dataUrl)
    return true
  } catch { return false }
}
