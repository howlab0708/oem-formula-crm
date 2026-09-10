'use client'

/**
 * 견적서 발행자(공급자) 정보와 직인.
 *
 * 공장에서 받은 견적서는 모두 오른쪽 위에 공급자 칸이 있고(등록번호·상호·대표자·주소·
 * 연락처) 상호 옆에 직인이 찍혀 있다. 고객에게 보내는 제안서도 같은 모양이어야 해서
 * 그 칸에 넣을 값을 여기서 들고 있는다.
 *
 * 로고와 같이 **이 브라우저에만** 남기고 서버·데이터베이스로 보내지 않는다.
 * 직인은 문서를 성립시키는 데 쓰이는 이미지라 로고보다 더 조심해야 한다 - 서버에
 * 두면 회사 하나가 아니라 접근 권한을 가진 모두의 문제가 된다. 공용 PC 에서는
 * 쓰고 나서 지우도록 화면에서 안내한다.
 */

export type Issuer = {
  /** 상호(예: 주식회사 하우랩) */
  company: string
  /** 사업자등록번호 */
  registration: string
  /** 대표자 */
  ceo: string
  address: string
  /** 전화·팩스·메일을 한 줄로 */
  contact: string
  /** 직인 이미지(투명 PNG data URL). 없으면 null. */
  seal: string | null
}

export const EMPTY_ISSUER: Issuer = {
  company: '',
  registration: '',
  ceo: '',
  address: '',
  contact: '',
  seal: null,
}

/** 공급자 칸에 넣을 값이 하나라도 있는지. 전부 비면 문서에 칸을 그리지 않는다. */
export function hasIssuer(issuer: Issuer | null): boolean {
  if (!issuer) return false
  return Boolean(
    issuer.company.trim() ||
      issuer.registration.trim() ||
      issuer.ceo.trim() ||
      issuer.address.trim() ||
      issuer.contact.trim() ||
      issuer.seal,
  )
}

/**
 * 직인 이미지를 읽는다. 로고와 달리 정사각형에 가깝고 투명 배경이어야 해서
 * 한 변 300px 로 맞춘다. 캔버스 PNG 는 투명도를 그대로 보존한다.
 *
 * 스캔한 직인은 배경이 흰색인 경우가 많다. 흰 배경째로 찍으면 아래 글자를 덮으므로
 * `dropWhite` 를 켜면 흰색에 가까운 화소를 투명하게 바꾼다.
 */
export async function readSeal(file: File, dropWhite = true): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('2MB 이하 PNG·JPG 직인 이미지를 선택해 주세요.')
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('직인 이미지를 읽지 못했습니다.')
  })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20000000) {
      throw new Error('직인은 2천만 화소 이하 이미지를 사용해 주세요.')
    }
    const scale = Math.min(1, 300 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('직인을 처리하지 못했습니다.')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    if (dropWhite) {
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = image.data
      for (let i = 0; i < data.length; i += 4) {
        // 흰색에 가까운 화소만 지운다. 붉은 인영은 R 이 높아도 G·B 가 낮아 살아남는다.
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) data[i + 3] = 0
      }
      ctx.putImageData(image, 0, 0)
    }
    return canvas.toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}

const STORAGE_KEY = 'oem-crm.export-issuer'

/*
 * 읽은 값을 붙들어 둔다. 직인이 든 data URL 이 수십만 자라 `useSyncExternalStore` 의
 * 스냅숏으로 쓰려면 매 렌더마다 같은 객체를 돌려주어야 한다(로고와 같은 이유).
 */
let cached: Issuer | null | undefined

function parse(raw: string): Issuer | null {
  try {
    const value = JSON.parse(raw) as Partial<Issuer>
    const text = (input: unknown) => (typeof input === 'string' ? input.slice(0, 200) : '')
    const seal = typeof value.seal === 'string' && value.seal.startsWith('data:image/png;base64,') ? value.seal : null
    return {
      company: text(value.company),
      registration: text(value.registration),
      ceo: text(value.ceo),
      address: text(value.address),
      contact: text(value.contact),
      seal,
    }
  } catch {
    return null
  }
}

/** 저장해 둔 공급자 정보. 저장소를 못 읽는 환경에서는 null 이다. */
export function loadStoredIssuer(): Issuer | null {
  if (cached !== undefined) return cached
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cached = raw ? parse(raw) : null
  } catch {
    cached = null
  }
  return cached
}

/*
 * 공급자 정보를 등록하는 곳과 문서를 그리는 곳이 서로 다른 화면이다.
 * 등록 대화상자에서 저장한 값을 내보내기 쪽이 곧바로 쓰도록 바뀜을 알린다 -
 * 알리지 않으면 방금 올린 직인 없이 문서가 만들어진다.
 */
const listeners = new Set<() => void>()

export function subscribeIssuer(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 저장에 성공했는지 돌려준다. 실패해도 이번 화면의 내보내기에는 그대로 쓴다. */
export function storeIssuer(issuer: Issuer | null): boolean {
  cached = issuer && hasIssuer(issuer) ? issuer : null
  try {
    if (cached === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
    return true
  } catch {
    return false
  } finally {
    listeners.forEach((listener) => listener())
  }
}
