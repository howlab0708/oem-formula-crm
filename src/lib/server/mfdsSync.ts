import { canReplaceDataset, getDatasetMeta, getSql, isDatabaseConfigured } from '../db'
import { fetchC003, MFDS_PAGE_SIZE, SyncError, type MFDSPayload } from './mfdsC003'
import { productionSyncStore, type SyncRun, type SyncStore } from './mfdsSyncStore'

export function syncConfigured() {
  return process.env.MFDS_SYNC_ENABLED === '1' && canReplaceDataset() && isDatabaseConfigured()
    && /^[a-zA-Z0-9]{10,100}$/.test(process.env.MFDS_API_KEY ?? '')
    && (process.env.CRON_SECRET?.length ?? 0) >= 32
}

export async function syncStatus() {
  const enabled = process.env.MFDS_SYNC_ENABLED === '1'
  let run: (SyncRun & { busy: boolean }) | null = null
  const configured = isDatabaseConfigured()
  const meta = configured ? await getDatasetMeta() : null
  if (configured) {
    const sql = getSql()
    const [table] = await sql`select to_regclass('oem_sync.runs') as name`
    if (table.name) {
      const [latest] = await sql<(SyncRun & { busy: boolean })[]>`select *, coalesce(lease_until > now(), false) as busy from oem_sync.runs order by started_at desc limit 1`
      run = latest ?? null
    }
  }
  return {
    configured: syncConfigured(), enabled, canRun: syncConfigured(),
    generation: meta?.generation ?? null, lastSuccess: meta?.provenance?.transport === 'api' ? meta.finished_at : null,
    run: run ? { state: run.state, busy: run.busy, fetched: run.fetched, expected: run.expected, added: run.added, changed: run.changed, retained: run.retained, message: run.message, finishedAt: run.finished_at } : null,
  }
}

export async function startSync() {
  if (!syncConfigured()) throw new SyncError('setup', '자동 연동 설정을 완료한 뒤 업데이트할 수 있습니다.')
  const store = await productionSyncStore()
  return { store, run: await store.claim() }
}

/** Persist every page. A closed browser does not stop work; an expired invocation can be resumed. */
export async function collectSync(
  store: Pick<SyncStore, 'reclaimSpace' | 'chargeRequest' | 'savePage' | 'publish' | 'stop'>,
  initialRun: SyncRun,
  read: (start: number, end: number) => Promise<MFDSPayload> = (start, end) => fetchC003(process.env.MFDS_API_KEY ?? '', start, end),
  budgetMs = 240_000,
) {
  let run = initialRun
  const deadline = Date.now() + budgetMs
  try {
    await store.reclaimSpace()
    while (run.expected === null || run.fetched < run.expected) {
      if (Date.now() >= deadline - 25_000) throw new SyncError('duration', '이번 수집 시간을 마쳤습니다. 이어받기로 계속하거나 다음 자동 실행을 기다려 주세요.', true)
      await store.chargeRequest(run)
      const page = await read(run.fetched + 1, Math.min(run.fetched + MFDS_PAGE_SIZE, run.expected ?? Infinity))
      run = await store.savePage(run, page)
    }
    // Recheck the source count just before changing the visible generation.
    if (Date.now() >= deadline - 25_000) throw new SyncError('duration', '수집이 끝났습니다. 이어받기로 최종 확인을 진행해 주세요.', true)
    await store.chargeRequest(run)
    const probe = await read(1, 1)
    await store.publish(run, probe.total)
    return 'complete' as const
  } catch (error) {
    const safe = error instanceof SyncError ? error : new SyncError('storage', '수집 결과를 저장하지 못해 기존 데이터를 유지합니다. 다시 시도해 주세요.')
    // An old worker must never overwrite the status of its replacement.
    if (safe.code !== 'lease') await store.stop(run, safe)
    return safe.retryable ? 'paused' as const : 'failed' as const
  }
}
