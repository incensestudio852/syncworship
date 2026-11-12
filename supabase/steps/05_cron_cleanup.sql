-- STEP 5 —— 每晚 03:00（香港時間）刪除超過 3 個月的清單
-- 前置：Dashboard → Database → Extensions → 啟用 pg_cron（inline 參數不用改）
-- 若尚未啟用會報 "function cron.schedule(...) does not exist" —— 這一步可以先跳過，不影響其他功能。

select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-worship-lists';

select cron.schedule('cleanup-worship-lists', '0 19 * * *', $$
  delete from public.worship_lists
  where event_date < ((now() at time zone 'Asia/Hong_Kong')::date - interval '3 months');
$$);

select jobid, schedule, jobname from cron.job where jobname = 'cleanup-worship-lists';
