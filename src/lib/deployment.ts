/**
 * 이 배포가 어느 회사 것인지 화면에 밝히는 이름.
 *
 * 회사마다 배포를 따로 두면(`APP_TENANT`, `docs/deploy-per-company.md`) 화면이 똑같아서
 * 탭을 두 개 열었을 때 구분되지 않는다. 남의 회사 원가를 다루는 도구라 A사 화면에 B사
 * 배합비를 붙여넣는 사고가 가장 위험하다.
 *
 * `APP_TENANT` 를 그대로 쓰지 않는 이유: 그 값은 SQL 식별자라서 소문자·영문만 되는데
 * 화면에는 `하우랩` 처럼 읽히는 이름이 나와야 한다. 그래서 표시용 이름표를 따로 둔다.
 *
 * 값이 없으면 지금까지와 똑같이 보인다(회사가 한 곳일 때 군더더기를 붙이지 않는다).
 */
export function deployLabel(): string {
  const raw = process.env.APP_LABEL?.trim()
  if (!raw) return ''
  // 제목과 헤더에 그대로 들어가는 값이라 길이만 제한한다.
  return raw.slice(0, 30)
}

const BASE_TITLE = '건기식 OEM 배합비 솔루션'

/**
 * 브라우저 탭 제목. 이름표를 **앞에** 붙인다 -
 * 탭이 좁아지면 뒤가 먼저 잘리므로, 구분해야 하는 이름이 앞에 있어야 보인다.
 */
export function pageTitle(): string {
  const label = deployLabel()
  return label ? `${label} · ${BASE_TITLE}` : BASE_TITLE
}

/**
 * 로그인 화면의 탭 제목. 여기도 이름표를 앞에 붙인다.
 *
 * 로그인 전 화면이 가장 위험하다 - 두 회사 사이트가 똑같이 보이는데 여기서 헷갈리면
 * 다른 회사 사이트에 그 회사 비밀번호를 입력하게 된다.
 */
export function loginTitle(): string {
  const label = deployLabel()
  return label ? `${label} 로그인 · ${BASE_TITLE}` : `로그인 · ${BASE_TITLE}`
}
