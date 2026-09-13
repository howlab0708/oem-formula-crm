import { after } from 'next/server'
import { collectSync, startSync, syncStatus } from '@/lib/server/mfdsSync'
import { SyncError } from '@/lib/server/mfdsC003'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
  try { return Response.json(await syncStatus(), { headers }) }
  catch { return Response.json({ error: '자동 연동 상태를 불러오지 못했습니다.' }, { status: 503, headers }) }
}

export async function POST(request: Request) {
  // Cookie authentication is enforced by proxy; a cross-site form must not start a shared update.
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '앱에서 다시 요청해 주세요.' }, { status: 403, headers })
  try {
    const { store, run } = await startSync()
    after(async () => {
      try { await collectSync(store, run) }
      catch { console.error('[mfds-sync] Update interrupted; the persisted lease permits a later retry.') }
    })
    return Response.json({ accepted: true }, { status: 202, headers })
  } catch (error) {
    return Response.json({ error: error instanceof SyncError ? error.message : '업데이트를 시작하지 못했습니다.' }, { status: error instanceof SyncError && error.retryable ? 409 : 503, headers })
  }
}
