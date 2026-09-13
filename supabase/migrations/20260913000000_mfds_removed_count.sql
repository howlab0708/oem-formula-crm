-- Existing run history remains intact; future runs record source-only deletions separately.
alter table if exists oem_sync.runs add column if not exists removed integer not null default 0;
