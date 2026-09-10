'use client'

/**
 * 문서에 찍히는 우리 회사 표시 - 로고 · 공급자 정보 · 직인.
 *
 * 등록하는 자리가 두 곳이다. 브리핑 카드를 뽑는 ‘내보내기 설정’ 과, 배합 제안서를
 * 뽑는 ‘고객 배포용 PDF’ 다. 두 화면에 각각 만들면 칸이 두 벌이 되어 어느 쪽에
 * 넣었는지 헷갈리므로 여기 한 벌만 두고 양쪽에서 같이 쓴다.
 *
 * 값은 `logo.ts`·`issuer.ts` 가 이 브라우저에만 저장한다. 서버로 보내지 않는다 -
 * 직인은 문서를 성립시키는 데 쓰이는 이미지라 더 조심해야 한다.
 */

import { useState, useSyncExternalStore } from 'react'
import { loadStoredLogo, readLogo, storeLogo, subscribeLogo } from '@/lib/export/logo'
import {
  EMPTY_ISSUER,
  loadStoredIssuer,
  readSeal,
  storeIssuer,
  subscribeIssuer,
  type Issuer,
} from '@/lib/export/issuer'

/** 공급자 칸에 넣을 값. 공장 견적서의 항목 이름을 그대로 쓴다. */
const FIELDS: { key: Exclude<keyof Issuer, 'seal'>; label: string; placeholder: string }[] = [
  { key: 'company', label: '상호', placeholder: '예: 주식회사 하우랩' },
  { key: 'registration', label: '사업자등록번호', placeholder: '예: 000-00-00000' },
  { key: 'ceo', label: '대표자', placeholder: '대표자 성명' },
  { key: 'address', label: '주소', placeholder: '사업장 주소' },
  { key: 'contact', label: '연락처', placeholder: '전화 · 팩스 · 메일' },
]

const inputClass = 'mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink'

/**
 * 이미지 고르는 칸.
 *
 * 기본 `<input type="file">` 은 ‘파일 선택 / 선택된 파일 없음’ 글씨만 나와서 주변
 * 설명문에 묻힌다. 테두리 있는 상자로 감싸 고르는 자리임을 먼저 보이게 하고, 실제
 * 입력칸은 화면에서만 숨긴다(포커스는 그대로 받으므로 키보드로도 열 수 있고,
 * 상자에 `focus-within` 테를 둘러 어디에 포커스가 있는지 보인다).
 *
 * 등록된 뒤에는 상자 색이 바뀌고 안에 실물이 보인다 - 무엇이 문서에 찍힐지
 * 미리보기를 누르지 않고도 알 수 있어야 한다.
 */
function ImagePicker({
  pickLabel,
  hint,
  ariaLabel,
  value,
  alt,
  thumbClass,
  onPick,
  onRemove,
}: {
  pickLabel: string
  hint: string
  ariaLabel: string
  value: string | null
  alt: string
  thumbClass: string
  onPick: (file: File) => void
  onRemove: () => void
}) {
  return (
    <div
      className={`mt-2 rounded-lg border border-dashed px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-accent/40 ${
        value ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface-sunken'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <span className="flex items-center justify-center rounded-md border border-line bg-surface p-1">
            {/* 로컬에서 처리한 이미지다. 외부 요청이 없다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={alt} className={thumbClass} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken">
            {value ? '다시 선택' : pickLabel}
            <input
              type="file"
              accept="image/png,image/jpeg"
              aria-label={ariaLabel}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onPick(file)
              }}
            />
          </label>
          <span className="mt-1.5 block text-[11px] text-ink-3">{hint}</span>
        </span>
        {value ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
          >
            제거
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function DocumentIdentity() {
  const logo = useSyncExternalStore(subscribeLogo, loadStoredLogo, () => null)
  const stored = useSyncExternalStore(subscribeIssuer, loadStoredIssuer, () => null)
  const issuer = stored ?? EMPTY_ISSUER
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  // 글자를 칠 때마다 저장한다. 저장 단추를 따로 두면 채워 놓고 안 눌러 문서에 안 나온다.
  const save = (next: Issuer) => {
    setError('')
    setNote(storeIssuer(next) ? '' : '이 브라우저에 저장하지 못했습니다. 새로고침하면 사라집니다.')
  }

  const pickImage = async (file: File, kind: 'logo' | 'seal') => {
    setError('')
    try {
      if (kind === 'logo') {
        const next = await readLogo(file)
        setNote(storeLogo(next) ? '로고를 등록했습니다.' : '로고를 적용했습니다. 이 브라우저에 저장하지 못했습니다.')
      } else {
        const seal = await readSeal(file)
        const ok = storeIssuer({ ...issuer, seal })
        setNote(ok ? '직인을 등록했습니다.' : '직인을 적용했습니다. 이 브라우저에 저장하지 못했습니다.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 읽지 못했습니다.')
    }
  }

  return (
    <div className="text-[13px] text-ink-2">
      <fieldset>
        <legend className="font-medium text-ink">회사 로고</legend>
        <p className="mt-1 text-[12px] text-ink-3">문서 맨 위 왼쪽에 들어갑니다.</p>
        <ImagePicker
          pickLabel="로고 이미지 선택"
          hint="PNG · JPG · 2MB 이하"
          ariaLabel="회사 로고 이미지"
          value={logo}
          alt="등록된 회사 로고"
          thumbClass="h-9 max-w-32 object-contain"
          onPick={(file) => void pickImage(file, 'logo')}
          onRemove={() => {
            storeLogo(null)
            setNote('로고를 제거했습니다.')
          }}
        />
      </fieldset>

      <fieldset className="mt-4 border-t border-line pt-3">
        <legend className="font-medium text-ink">공급자 정보 · 직인</legend>
        <p className="mt-1 text-[12px] leading-4 text-ink-3">
          배합 제안서 PDF 오른쪽 위 ‘공급자’ 칸에 들어갑니다. 공장에서 받는 견적서와 같은 자리입니다.
        </p>
        {FIELDS.map((field) => (
          <label key={field.key} className="mt-2 block text-[12px]">
            {field.label}
            <input
              value={issuer[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => save({ ...issuer, [field.key]: event.target.value })}
              className={inputClass}
            />
          </label>
        ))}

        <p className="mt-4 text-[12px] font-medium text-ink-2">직인 (도장) 이미지</p>
        <ImagePicker
          pickLabel="직인 이미지 선택"
          hint="PNG · JPG · 2MB 이하 · 스캔한 도장도 됩니다"
          ariaLabel="직인 이미지"
          value={issuer.seal}
          alt="등록된 직인"
          thumbClass="h-14 w-14 object-contain"
          onPick={(file) => void pickImage(file, 'seal')}
          onRemove={() => {
            save({ ...issuer, seal: null })
            setNote('직인을 제거했습니다.')
          }}
        />
        <p className="mt-2 text-[12px] leading-4 text-ink-3">
          직인은 문서를 성립시키는 데 쓰이는 이미지입니다. 로고와 같이 <strong>이 브라우저에만</strong> 저장하고 서버로
          보내지 않습니다 — 공용 PC 에서는 쓰고 나서 반드시 제거해 주세요. 스캔한 도장의 흰 배경은 자동으로 지워 아래
          글자를 덮지 않게 합니다.
        </p>
      </fieldset>

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-2 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <p aria-live="polite" className="mt-2 text-[12px] text-ink-2">
          {note}
        </p>
      ) : null}
    </div>
  )
}
