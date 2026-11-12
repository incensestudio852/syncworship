'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Info, Smartphone, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Label } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { getDeviceName, setDeviceName, fallbackDeviceName } from '@/lib/deviceName';
import { CFG } from '@/config';

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [name, setName] = useState('');

  useEffect(() => {
    setName(getDeviceName() ?? fallbackDeviceName());
  }, []);

  return (
    <div className="space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-fg)] hover:text-[var(--fg)]"
      >
        <ArrowLeft size={15} /> 回清單列表
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">設定</h1>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Smartphone size={15} /> 本裝置
        </h2>
        <Field label="裝置名稱（顯示在「由 ___ 推送」）">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            <Button
              variant="primary"
              onClick={() => {
                setDeviceName(name);
                toast('已儲存裝置名稱', 'success');
              }}
              disabled={!name.trim()}
            >
              <Check size={15} /> 儲存
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted-fg)]">
          全團隊共用同一個登入帳號，因此系統無法辨認「誰」推送；裝置名稱是本機自行命名的標籤。
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">帳號</h2>
        <p className="text-xs text-[var(--muted-fg)]">{user?.email ?? '—'}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-fg)]">
          所有已登入裝置擁有相同的讀寫權限（新增、編輯、刪除詩歌與清單、推送上台）。
        </p>
      </Card>

      <Card className="space-y-2.5 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info size={15} /> 使用說明與限制
        </h2>
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-[var(--muted-fg)]">
          <li>
            · 教會歌詞辨識（OCR）只是建議，不是轉錄——對和弦譜與手寫字尤其不準，請務必自行核對。
          </li>
          <li>· 本系統不保存原始 PDF；請團隊自行備份原檔。</li>
          <li>· 上傳限制：單一檔案 {Math.round(CFG.MAX_UPLOAD_BYTES / 1024 / 1024)}MB、PDF 最多 {CFG.PDF_MAX_PAGES} 頁；影像自動壓縮為寬 {CFG.IMAGE_MAX_WIDTH}px 的 WebP。</li>
          <li>· 超過 3 個月的敬拜清單會於每日 03:00（香港時間）自動刪除。</li>
          <li>· 離線時只保留目前開啟的清單及其樂譜影像。</li>
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Trash2 size={15} /> 本機快取
        </h2>
        <p className="text-[11px] leading-relaxed text-[var(--muted-fg)]">
          清除後，離線時將無法顯示已快取的清單與樂譜；重新開啟清單即可再次下載。
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            try {
              await caches.delete('worship-offline-v1');
              toast('已清除本機快取', 'success');
            } catch {
              toast('清除失敗', 'error');
            }
          }}
        >
          清除快取
        </Button>
      </Card>

      <p className="pb-6 text-center text-[11px] text-[var(--muted-fg)]">
        快捷鍵（舞台上）：← → 切歌 · C 和弦 · D 深色 · F 全螢幕
      </p>
    </div>
  );
}
