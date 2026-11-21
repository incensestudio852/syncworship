# Sync Worship

**A worship stage display for church teams who are tired of guessing what song is next.**

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E2V52B1CCI)

Sync Worship keeps a song library, builds the order of service, and pushes the current song to every screen on stage — chords, lyrics, key, and what happens after the last chorus. A tablet at the front of the room shows what the band's music stand shows.

The interface is **Traditional Chinese only** for now. The code and this document are in English.

<sub>**English** · [繁體中文](README.zh-Hant.md)</sub>

---

## What it does

- **Song library** — upload a chord-sheet PDF or a photo of one. It gets converted to compressed WebP pages, and page one is read by OCR to pull out lyrics and chords.
- **Worship lists** — order the songs, set each one's key, tempo, and section flow, and add transition notes.
- **Realtime push** — the leader taps push; every stage device switches to that song at the same moment.
- **Stage display** — large lyrics with chords above each syllable, a key transposer, and a section counter so you know how many choruses are left.
- **Offline** — songs and lists are cached. If the church Wi-Fi drops mid-set, the screens keep working.
- **Share links** — send a read-only link to a guest musician who does not have an account.

## The problem

A worship team runs on paper. Someone prints chord sheets, someone else pencilled in a key change, and the sheets get lost between practices. When the leader says "let's go to the bridge", every musician hunts through their own stack.

Sync Worship replaces the stack. One person builds the list, everyone else reads from the same screen.

---

## How to use it

1. **Sign in.** The team shares one account. After signing in, name your device in Settings — that name appears when you push, so people know where it came from.
2. **Add a song.** Upload the chord sheet. Check what OCR read — the sheet image is always there, so you can compare. Fix the lyrics if needed.
3. **Edit the lyrics** with chords written inline: `[G]奇異恩典 [C]何等甘甜`. The chord toolbar sits above the field, and on a desktop a panel sits beside it with every chord in the current key.
4. **Build a list.** Add songs, drag to reorder, then set each song's key, tempo, section flow, and transitions.
5. **Open the list on stage.** Tap 推送 (push) and the current song appears on every device.
6. **Transpose as needed.** Each screen can move the key up or down without affecting anyone else.

## Screens

**Stage** — the view the musician actually reads. Oversized lyrics, chords above the syllables, a section counter, and the next transition at the bottom.

**List detail** — the order, with each song's key and flow. This is where the leader works before the service starts.

**Library** — every song, searchable by title, lyrics, or tag.

**Song editor** — the chord entry surface: inline `[G]` syntax, aligned chord blocks, section labels, and a desktop chord panel.

---

## Chord syntax

Two ways to write chords.

**Inline** — the chord goes in square brackets directly before the syllable it lands on:

```
[G]奇異恩典 [C]何等甘[G]甜
```

**Aligned blocks** — for passages where one word carries two chords, spacing carries meaning:

````
```chords
D   E  A    E/G# F#m
往深海踏出去 放低一切顧慮
```
````

The block renders in a monospaced panel and keeps its columns. It does not wrap, because the columns *are* the notation.

Section labels work in either form: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Tag]`, and their Chinese equivalents.

## Key transposition

Every display — the song page and the stage — carries a semitone stepper. The sounding key shows in the corner with the written key beside it once you move. Transposition is per-device and per-view: nothing is written back to the song, so you cannot accidentally save a transposed chart over the original.

---

## Why these choices

**WebP instead of the original files.** A 10 MB PDF holds maybe four readable pages. Converted to WebP at 1100 px and quality 80, those pages come to a few hundred KB, which is what makes offline caching on a tablet realistic. It also means the original file is never uploaded or stored — you keep your own backup, and the server only ever holds images.

**OCR on page one only.** The first page of a chord sheet usually carries the title, key, composer, and the first verse with chords. Reading one page costs a few seconds; reading thirty costs a minute and mostly produces text you would have to correct anyway. What OCR cannot do is read a staff or numbered-notation lead sheet — the app detects those and leaves the lyrics field alone rather than filling it with nonsense.

**LRCLIB for lyrics, as an experiment.** It is a free, open, community-maintained lyrics database with a plain HTTP API and no CORS restrictions, so the browser can call it directly with no proxy. The catch is coverage: it is built around recorded popular music, so English worship songs fare well and Cantonese or Mandarin worship songs often return nothing. When it does find something, the result is frequently in Simplified Chinese. The search sits behind a button labelled 實驗 (experimental) and always shows you a preview before inserting anything.

---

## Self-hosting

You need Node 20+ and a Supabase project.

```bash
git clone https://github.com/incensestudio852/syncworship.git
cd syncworship
npm install
```

Run the SQL in `supabase/steps/` in order against your Supabase project. Then set:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your publishable key>
```

```bash
npm run dev      # local, includes the asset copy step
npm run build    # static export to out/
npm run deploy   # build + wrangler deploy
```

`DEPLOY.md` covers the Cloudflare side in full.

**Two things that will trip you up:**

- The app is a **static export**. There is no server runtime, no API routes, no middleware. Anything that needs a server lives in `functions/` or `worker.ts` as a separate edge layer.
- The `pg_cron` step is optional and not enabled by default. Without it, the three-month cleanup of old sheets does not run. It will also abort a fresh sequential setup if `pg_cron` is missing, so skip that step unless you want it.

## Tech

Next.js (static export) · Supabase (Postgres, Auth, Storage, Realtime) · Cloudflare Workers · Tesseract.js for OCR · pdf.js for PDF rendering · opencc-js for Simplified-to-Traditional conversion.

Deliberate constraints: 10 MB upload cap, 1100 px WebP output, 30 page PDF limit, one shared team account, no original file retention.

---

## Credits

The chord arrangement used as the sample in the app comes from **原始和聲 Raw Harmony**, whose chord sheets are public at [rawharmony.hk/chords](https://www.rawharmony.hk/chords). Thank you for making them freely available.

If these songs have been useful to you, **支持詩歌創作，歡迎按感動奉獻** — please consider supporting their work.

## License

MIT. See [LICENSE](LICENSE).

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E2V52B1CCI)
