-- STEP 4 —— 開啟 Realtime（舞台即時同步必需）
-- 若報 "already member of publication"，代表已經開好了，可以忽略。
do $$
begin
  begin
    alter publication supabase_realtime add table public.list_items;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.live_state;
  exception when duplicate_object then null; end;
end $$;

-- 確認：應列出 list_items 與 live_state
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by 1;
