import { safeEqual } from '@/lib/auth'
import { collectSync, startSync } from '@/lib/server/mfdsSync'
import { SyncError } from '@/lib/server/mfdsC003'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  // Other tenant deployments share the repository, but only one should collect the shared dataset.
  if (process.env.MFDS_SYNC_ENABLED !== '1') return Response.json({ skipped: true }, { headers })
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32 || !safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  try {
    const { store, run } = await startSync()
    const state = await collectSync(store, run)
    return Response.json({ state }, { status: state === 'complete' ? 200 : 503, headers })
  } catch (error) {
    if (error instanceof SyncError && ['busy','recent'].includes(error.code)) return Response.json({ skipped: true }, { headers })
    return Response.json({ error: error instanceof SyncError ? error.message : '업데이트를 시작하지 못했습니다.' }, { status: 503, headers })
  }
}
