import { mainIngredientKey } from './ingredientNames'

export const RDA_SOURCE = 'https://www.kns.or.kr/fileroom/fileroom_view.asp?BoardID=Kdr&idx=167'
export const RDA_VERSION = '2025 한국인 영양소 섭취기준'
const ages = ['19–29세', '30–49세', '50–64세', '65–74세', '75세 이상']
export const RDA_PROFILES = ['male', 'female'].flatMap(sex => ages.map((age, i) => ({
  id: `${sex}-${i}`, label: `${sex === 'male' ? '남성' : '여성'} ${age}`,
})))
export const DEFAULT_RDA_PROFILE = 'male-0'
export const isRdaProfile = (id: unknown): id is string => RDA_PROFILES.some(p => p.id === id)
/** 권장섭취량(RNI)이 있으면 그 값, 없는 영양소는 충분섭취량(AI). 어느 쪽인지 함께 남긴다. */
export type RdaBasis = 'RNI' | 'AI'
type Entry = { label: string; unit: string; male: number[]; female: number[]; qualifier?: string; basis: RdaBasis }
const repeat = (n: number) => Array<number>(5).fill(n)
const make = (basis: RdaBasis) =>
  (label: string, unit: string, male: number | number[], female: number | number[], qualifier?: string): Entry => ({
    label, unit, basis, qualifier,
    male: typeof male === 'number' ? repeat(male) : male,
    female: typeof female === 'number' ? repeat(female) : female,
  })
const rni = make('RNI')
const ai = make('AI')
/*
 * 2025 한국인 영양소 섭취기준 요약표(보건복지부, 2025)의 성인 성별·연령 5구간.
 * 임신부·수유부 부가량과 상한섭취량은 넣지 않는다.
 * 권장섭취량 칸이 있는 영양소는 그 값을, 칸 자체가 없는 영양소(비타민 D·E·K,
 * 판토텐산, 비오틴, 콜린, 나트륨, 염소, 칼륨, 불소, 망간, 크롬)는 충분섭취량을 쓴다.
 * 요약표 지용성비타민 / 수용성비타민 / 비타민 유사 영양소 / 다량무기질 / 미량무기질 표.
 */
const nutrients: Record<string, Entry> = {
  // 지용성 비타민
  비타민a: rni('비타민A', 'μg RAE', [800,800,750,700,700], [650,650,600,600,600], 'RAE'),
  비타민d: ai('비타민D', 'μg', [10,10,10,15,15], [10,10,10,15,15]),
  비타민e: ai('비타민E', 'mg α-TE', 12, 12),
  비타민k: ai('비타민K', 'μg', 75, 65),
  // 수용성 비타민
  비타민c: rni('비타민C', 'mg', 100, 100),
  비타민b1: rni('비타민B1', 'mg', [1.2,1.2,1.2,1.1,1.1], [1.1,1.1,1.1,1,.8]),
  비타민b2: rni('비타민B2', 'mg', [1.5,1.5,1.5,1.4,1.4], [1.2,1.2,1.2,1.1,1]),
  나이아신: rni('나이아신', 'mg NE', [14,14,14,13,12], [13,13,13,12,11]),
  비타민b6: rni('비타민B6', 'mg', 1.5, 1.4),
  엽산: rni('엽산', 'μg DFE', 400, 400, 'DFE'),
  비타민b12: rni('비타민B12', 'μg', 2.4, 2.4),
  판토텐산: ai('판토텐산', 'mg', 5, 5),
  비오틴: ai('비오틴', 'μg', 30, 30),
  콜린: ai('콜린', 'mg', 480, 390),
  // 다량 무기질
  칼슘: rni('칼슘', 'mg', 800, [650,650,750,750,750]),
  인: rni('인', 'mg', 650, 650),
  나트륨: ai('나트륨', 'mg', [1500,1500,1500,1300,1200], [1500,1500,1500,1300,1200]),
  염소: ai('염소', 'mg', [2300,2300,2300,1900,1800], [2300,2300,2300,1900,1800]),
  칼륨: ai('칼륨', 'mg', 3500, 3500),
  마그네슘: rni('마그네슘', 'mg', [360,380,380,380,380], 280),
  // 미량 무기질
  철: rni('철', 'mg', [8,8,8,8,7], [12,12,7,6,6]),
  아연: rni('아연', 'mg', [10,10,10,9,9], [8,8,8,7,7]),
  구리: rni('구리', 'μg', [850,850,850,800,800], [650,650,650,600,600]),
  불소: ai('불소', 'mg', [3.5,3.4,3.2,3.1,3], [2.8,2.7,2.6,2.5,2.3]),
  망간: ai('망간', 'mg', 4, 3.5),
  요오드: rni('요오드', 'μg', 150, 150),
  셀레늄: rni('셀레늄', 'μg', 60, 60),
  몰리브덴: rni('몰리브덴', 'μg', [30,30,30,30,25], [25,25,25,25,20]),
  크롬: ai('크롬', 'μg', [30,30,30,25,25], [20,20,20,20,20]),
}
/*
 * 같은 영양소의 다른 표기만 통합한다. 비타민의 동족체 이름(티아민, 콜레칼시페롤 등)은
 * 그 비타민의 양으로 표시되므로 합치고, 무기질의 염 이름(산화아연, 탄산칼슘 등)은
 * 합치지 않는다 - 표시된 값이 염 전체 중량인지 원소 중량인지 이름만으로 가릴 수 없다.
 */
const aliases: Record<string, string> = {
  셀렌: '셀레늄', 아이오딘: '요오드',
  니아신: '나이아신', 니코틴산: '나이아신', 니코틴산아미드: '나이아신', 니코틴아미드: '나이아신', 비타민b3: '나이아신',
  티아민: '비타민b1', 리보플라빈: '비타민b2', 피리독신: '비타민b6',
  코발라민: '비타민b12', 시아노코발라민: '비타민b12', 비타민12: '비타민b12',
  판토텐산칼슘: '판토텐산', 비타민b5: '판토텐산',
  비오틴d: '비오틴', 비타민b7: '비오틴', 비타민h: '비오틴',
  폴산: '엽산', 폴레이트: '엽산', 비타민b9: '엽산',
  아스코르브산: '비타민c', 아스코르빈산: '비타민c',
  레티놀: '비타민a',
  비타민d2: '비타민d', 비타민d3: '비타민d', 콜레칼시페롤: '비타민d', 에르고칼시페롤: '비타민d',
  토코페롤: '비타민e', 알파토코페롤: '비타민e', 'α-토코페롤': '비타민e',
  비타민k1: '비타민k', 비타민k2: '비타민k', 필로퀴논: '비타민k', 메나퀴논: '비타민k',
}
export const rdaKey = (name: string) => {
  const key = mainIngredientKey(name).toLowerCase()
  return aliases[key] ?? key
}
/*
 * 지표성분 이름은 기준규격 원문에서 잘려 나온다. 같은 성분이 `- 아연`, `아연(%)`,
 * `아연 함량`, `아연(정제)`, `(다)아연`, `■ 아연` 처럼 여러 꼴로 들어오므로,
 * 영양소를 찾을 때만 항목 기호와 꼬리표를 걷어낸다. rdaKey 자체는 건드리지 않는다.
 */
const MARKER_PREFIX = /^(?:[-–—*■□●○▪]+|\[|[(［]?[가-힣][)）]|\d{1,2}\s*[.,)]?)\s*/
const MARKER_SUFFIX = /(?:[(［[][^)\］\]]*[)）\]])*\s*\]?$/

/** 비타민·무기질이면 정규화한 열쇠, 아니면 null. */
export function nutrientKey(name: string): string | null {
  let text = name.normalize('NFKC').trim()
  for (let i = 0; i < 3 && MARKER_PREFIX.test(text); i++) text = text.replace(MARKER_PREFIX, '')
  const candidates = [text, text.replace(/\s*함량\s*$/, ''), text.replace(MARKER_SUFFIX, ''),
    text.replace(MARKER_SUFFIX, '').replace(/\s*함량\s*$/, '')]
  for (const candidate of candidates) {
    const key = rdaKey(candidate)
    if (key in nutrients) return key
  }
  return null
}

/** 표시용 기준값. profile 은 RDA_PROFILES 의 id. */
export function nutrientReference(key: string, profile: string) {
  const ref = nutrients[key]
  if (!ref) return null
  const validProfile = isRdaProfile(profile) ? profile : DEFAULT_RDA_PROFILE
  const [sex, index] = validProfile.split('-')
  return { label: ref.label, unit: ref.unit, basis: ref.basis, amount: ref[sex as 'male' | 'female'][Number(index)] }
}
/** 고함량 비율은 권장섭취량(RNI)만으로 센다. 충분섭취량은 이 비교에 쓰지 않는다. */
export function compareRda(name: string, valueMg: number | null, evidence: string, profile: string) {
  const ref = nutrients[rdaKey(name)]
  if (!ref || ref.basis !== 'RNI') return { amount: null, unit: '', ratio: null, reason: '권장섭취량 없음 또는 기준 미등록' }
  const validProfile = isRdaProfile(profile) ? profile : DEFAULT_RDA_PROFILE
  const [sex, index] = validProfile.split('-')
  const amount = ref[sex as 'male' | 'female'][Number(index)]
  if (valueMg === null || (ref.qualifier && !new RegExp(`(?:mcg|μg|ug|mg|g)\\s*${ref.qualifier}\\b`, 'i').test(evidence))) {
    return { amount, unit: ref.unit, ratio: null, reason: '비교 단위 확인 필요' }
  }
  const value = valueMg * (ref.unit.startsWith('μg') ? 1000 : 1)
  return { amount, unit: ref.unit, ratio: value / amount, reason: '' }
}
