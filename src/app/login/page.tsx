import type { Metadata } from 'next'
import { safeNextPath } from '@/lib/auth'

export const metadata: Metadata = {
  title: '로그인 · 건기식 OEM 배합비 솔루션',
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<{ error?: string; next?: string; setup?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  const wrongPassword = params.error === '1'
  const missingConfig = params.setup === '1'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-[18px] leading-6 font-semibold text-ink">건기식 OEM 배합비 솔루션</h1>
        <p className="mt-1.5 text-[12px] leading-5 text-ink-3 keep-all">
          사내 영업용 도구입니다. 전달받은 비밀번호를 입력하세요.
        </p>

        {missingConfig ? (
          <div className="mt-5 rounded-lg border border-line bg-surface px-4 py-3.5">
            <p className="text-[12px] leading-5 font-medium text-ink">설정이 필요합니다</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-2 keep-all">
              배포 환경에 <code className="rounded bg-surface-sunken px-1">APP_PASSWORD</code>{' '}
              환경변수가 없습니다. Vercel 프로젝트의 Settings → Environment Variables 에서 추가한 뒤
              다시 배포하세요.
            </p>
          </div>
        ) : (
          <form
            action="/api/login"
            method="post"
            className="mt-5 rounded-lg border border-line bg-surface px-5 py-5"
          >
            <input type="hidden" name="next" value={next} />

            <label htmlFor="password" className="text-[12px] font-semibold text-ink">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              aria-invalid={wrongPassword}
              aria-describedby={wrongPassword ? 'password-error' : undefined}
              className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3"
            />

            {wrongPassword ? (
              <p
                id="password-error"
                role="alert"
                className="mt-2 text-[12px] leading-5 text-danger"
              >
                비밀번호가 맞지 않습니다.
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong"
            >
              들어가기
            </button>
          </form>
        )}

        <p className="mt-4 text-[11px] leading-4 text-ink-3 keep-all">
          한 번 입력하면 30일 동안 이 기기에서 다시 묻지 않습니다. 공용 PC 에서는 사용 후 브라우저
          쿠키를 지워 주세요.
        </p>
      </div>
    </main>
  )
}
