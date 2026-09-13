-- One-time transition from the legacy retention policy to the latest verified MFDS snapshot.
-- No API re-fetch is claimed. The original complete run remains in history.
-- Create a new generation so existing browser/server snapshot caches cannot mix old and new rows.
do $$
declare
  active_record record;
  source_run record;
  actual_count integer;
  source_count integer;
  removed_count integer;
  new_generation text;
begin
  perform pg_advisory_xact_lock(734003, 1);
  if exists(select 1 from oem_sync.runs where state in ('running', 'paused'))
    or exists(select 1 from public.import_status where status in ('in_progress', 'sync_staging')) then
    raise exception 'An import is pending; alignment was not applied';
  end if;
  select * into active_record from public.import_status where status='complete' order by finished_at desc limit 1 for update;
  if not found then raise exception 'No active dataset'; end if;
  select * into source_run from oem_sync.runs where id=active_record.generation and state='complete';
  if not found then raise exception 'The active dataset is not a verified MFDS run'; end if;
  if source_run.retained=0 then return; end if;
  if active_record.provenance->>'source' is distinct from 'mfds-c003'
    or active_record.provenance->>'transport' is distinct from 'api'
    or source_run.expected is distinct from source_run.fetched
    or source_run.fetched<=0 then
    raise exception 'Source validation metadata does not match';
  end if;
  select count(*)::integer, count(*) filter(where seq>=0 and seq<source_run.fetched)::integer,
    count(*) filter(where seq>=source_run.fetched)::integer
    into actual_count,source_count,removed_count from public.products where generation=active_record.generation;
  if source_count<>source_run.fetched or removed_count<>source_run.retained
    or actual_count<>source_count+removed_count
    or active_record.total_rows is distinct from actual_count or active_record.imported_rows is distinct from actual_count
    or exists(select 1 from public.products where generation=active_record.generation group by seq having count(*)>1) then
    raise exception 'Stored rows do not match the validated source and retained counts';
  end if;
  new_generation := 'mfds-aligned-' || gen_random_uuid()::text;
  insert into public.import_status(generation,status,file_name,total_rows,imported_rows,provenance)
    values(new_generation,'sync_staging','식약처 C003 최신 원본 정리',source_count,0,active_record.provenance);
  insert into public.products(generation,id,seq,payload)
    select new_generation,id,seq,payload from public.products
    where generation=active_record.generation and seq>=0 and seq<source_run.fetched;
  get diagnostics actual_count = row_count;
  if actual_count<>source_count then raise exception 'Copied source row count does not match'; end if;
  update public.import_status set status='archived' where status='complete';
  update public.import_status set status='complete',imported_rows=source_count,finished_at=now() where generation=new_generation;
  insert into oem_sync.runs(id,baseline,state,expected,fetched,added,changed,retained,removed,finished_at,updated_through,dated_rows,message)
    values(new_generation,active_record.generation,'complete',source_count,source_count,0,0,0,removed_count,now(),source_run.updated_through,source_run.dated_rows,
      '전체 재수집 없이 직전 완료 실행의 검증된 원본만 반영하여 기존 보존 항목을 삭제했습니다.');
end $$;
