import { mainIngredientKey } from './ingredientNames'

export const RDA_SOURCE = 'https://www.kns.or.kr/fileroom/fileroom_view.asp?BoardID=Kdr&idx=167'
export const RDA_VERSION = '2025 한국인 영양소 섭취기준'
const ages = ['19–29세', '30–49세', '50–64세', '65–74세', '75세 이상']
export const RDA_PROFILES = ['male', 'female'].flatMap(sex => ages.map((age, i) => ({
  id: `${sex}-${i}`, label: `${sex === 'male' ? '남성' : '여성'} ${age}`,
})))
export const DEFAULT_RDA_PROFILE = 'male-0'
export const isRdaProfile = (id: unknown): id is string => RDA_PROFILES.some(p => p.id === id)
type Entry = { unit: string; male: number[]; female: number[]; qualifier?: string }
const repeat = (n: number) => Array<number>(5).fill(n)
const entry = (unit: string, male: number | number[], female: number | number[], qualifier?: string): Entry => ({
  unit, male: typeof male === 'number' ? repeat(male) : male, female: typeof female === 'number' ? repeat(female) : female, qualifier,
})
/** Official summary pp.5–7,9–11: RNI columns only, never AI or UL.
 * Adult non-pregnant/non-lactating profiles; values versioned independently of MFDS ranges. */
const nutrients: Record<string, Entry> = {
  비타민c: entry('mg', 100, 100),
  비타민b1: entry('mg', [1.2,1.2,1.2,1.1,1.1], [1.1,1.1,1.1,1,.8]),
  비타민b2: entry('mg', [1.5,1.5,1.5,1.4,1.4], [1.2,1.2,1.2,1.1,1]),
  나이아신: entry('mg NE', [14,14,14,13,12], [13,13,13,12,11]),
  비타민b6: entry('mg', 1.5, 1.4),
  비타민b12: entry('μg', 2.4, 2.4),
  엽산: entry('μg DFE', 400, 400, 'DFE'),
  비타민a: entry('μg RAE', [800,800,750,700,700], [650,650,600,600,600], 'RAE'),
  칼슘: entry('mg', 800, [650,650,750,750,750]),
  인: entry('mg', 650, 650),
  마그네슘: entry('mg', [360,380,380,380,380], 280),
  철: entry('mg', [8,8,8,8,7], [12,12,7,6,6]),
  아연: entry('mg', [10,10,10,9,9], [8,8,8,7,7]),
  구리: entry('μg', [850,850,850,800,800], [650,650,650,600,600]),
  요오드: entry('μg', 150, 150),
  셀레늄: entry('μg', 60, 60),
  몰리브덴: entry('μg', [30,30,30,30,25], [25,25,25,25,20]),
}
const aliases: Record<string, string> = { 셀렌: '셀레늄', 니아신: '나이아신', 티아민: '비타민b1', 리보플라빈: '비타민b2' }
export const rdaKey = (name: string) => {
  const key = mainIngredientKey(name).toLowerCase()
  return aliases[key] ?? key
}
export function compareRda(name: string, valueMg: number | null, evidence: string, profile: string) {
  const ref = nutrients[rdaKey(name)]
  if (!ref) return { amount: null, unit: '', ratio: null, reason: '권장섭취량 없음 또는 기준 미등록' }
  const validProfile = isRdaProfile(profile) ? profile : DEFAULT_RDA_PROFILE
  const [sex, index] = validProfile.split('-')
  const amount = ref[sex as 'male' | 'female'][Number(index)]
  if (valueMg === null || (ref.qualifier && !new RegExp(`(?:mcg|μg|ug|mg|g)\\s*${ref.qualifier}\\b`, 'i').test(evidence))) {
    return { amount, unit: ref.unit, ratio: null, reason: '비교 단위 확인 필요' }
  }
  const value = valueMg * (ref.unit.startsWith('μg') ? 1000 : 1)
  return { amount, unit: ref.unit, ratio: value / amount, reason: '' }
}
