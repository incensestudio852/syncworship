-- STEP 1 —— 先啟用 pg_trgm 擴充功能
-- 你的專案目前沒有這個 extension，這是 migration 失敗的唯一原因。
-- Dashboard → Database → Extensions 也可以手動啟用（搜尋 pg_trgm → Enable）。
create extension if not exists pg_trgm;

-- 確認結果（應顯示 pg_trgm）
select extname from pg_extension order by 1;
