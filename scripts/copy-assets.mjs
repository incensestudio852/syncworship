// Copies self-hosted workers + traineddata into /public so static export serves them.
import { cp, mkdir, access, copyFile, readFile, writeFile, constants } from 'node:fs/promises';
import path, { join } from 'node:path';

const root = process.cwd();
const pub = path.join(root, 'public');
const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  // ---- pdf.js worker ----
  const pdfCandidates = [
    'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    'node_modules/pdfjs-dist/build/pdf.worker.mjs',
  ];
  for (const c of pdfCandidates) {
    const src = path.join(root, c);
    if (await exists(src)) {
      await copyFile(src, path.join(pub, 'pdf.worker.min.mjs'));
      console.log('pdf worker  ->', c);
      break;
    }
  }

  // ---- pdf.js cmaps + standard fonts ----
  // PDFs with CJK text reference CMap tables; without cMapUrl characters fail
  // to map and the page renders blank or garbled.
  await cp(join(root, 'node_modules/pdfjs-dist/cmaps'), join(pub, 'cmaps'), { recursive: true });
  console.log('cmaps       -> node_modules/pdfjs-dist/cmaps');
  await cp(join(root, 'node_modules/pdfjs-dist/standard_fonts'), join(pub, 'standard_fonts'), {
    recursive: true,
  });
  console.log('std fonts   -> node_modules/pdfjs-dist/standard_fonts');

  // pdf.js decodes JBIG2 scans (the common format for scanned lead sheets)
  // and JPEG2000 via WebAssembly. Without these the page renders BLANK, which
  // looks like an empty PDF rather than a decoder problem.
  await cp(join(root, 'node_modules/pdfjs-dist/wasm'), join(pub, 'wasm'), { recursive: true });
  console.log('wasm        -> node_modules/pdfjs-dist/wasm');

  // Tesseract v7 core/worker (tesseract.js pulls these from jsdelivr by default).
  await mkdir(path.join(pub, 'tesseract'), { recursive: true });
  const tesseractFiles = [
    ['node_modules/tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
    ['node_modules/tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ];
  for (const [src, dest] of tesseractFiles) {
    if (await exists(path.join(root, src))) {
      let code = await readFile(path.join(root, src), 'utf8');
      if (dest.endsWith('worker.min.js')) {
        // Re-point runtime downloads at our own static assets (no CDN at runtime).
        code = code
          .split('https://cdn.jsdelivr.net/npm/@tesseract.js-data/')
          .join('/tessdata/')
          .split('https://cdn.jsdelivr.net/npm/tesseract.js-core@v')
          .join('/tesseract-core/');
      }
      await writeFile(path.join(pub, dest), code);
      console.log('tesseract   ->', src);
    } else {
      console.warn('missing     ->', src);
    }
  }

  // tesseract.js-core (wasm blobs) — path varies by version.
  const coreDirs = [
    'node_modules/tesseract.js-core',
  ];
  for (const d of coreDirs) {
    if (await exists(path.join(root, d))) {
      await cp(path.join(root, d), path.join(pub, 'tesseract-core'), { recursive: true });
      console.log('tesseract-core ->', d);
    }
  }

  // ---- traineddata ----
  await mkdir(path.join(pub, 'tessdata'), { recursive: true });
  const tessRepo = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
  const langs = ['eng', 'chi_tra', 'chi_sim'];
  for (const lang of langs) {
    const out = path.join(pub, 'tessdata', `${lang}.traineddata.gz`);
    if (await exists(out)) {
      console.log('traineddata  ->', lang, '(cached)');
      continue;
    }
    // tessdata_fast from the official tessdata-data repo mirror
    const url = `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/${lang}.traineddata.gz`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out, buf);
      console.log('traineddata  ->', lang, `${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.warn('traineddata  ->', lang, 'FAILED', url, String(e));
    }
  }
  void tessRepo;
}

main().catch((e) => {
  console.error(e);
  process.exit(0); // never block install
});
