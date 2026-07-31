/**
 * PDF Slim — compression core.
 *
 * Strategy: render each page with pdf.js to a canvas, re-encode as JPEG,
 * repack into a fresh PDF with pdf-lib. Iterate quality/resolution down
 * until the output hits the target byte size (or we reach the floor and
 * return the best effort). Everything runs locally in the browser.
 */
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_RENDER_DIM = 2200;   // cap on rendered page dimension (px)
const MAX_ATTEMPTS = 10;
const MIN_SCALE = 0.35;
const MIN_QUALITY = 0.18;

/**
 * @param {ArrayBuffer} srcBytes   original PDF bytes
 * @param {number} targetBytes     desired max output size
 * @param {(info: {phase:string, attempt:number, page:number, numPages:number, currentBytes:number}) => void} onProgress
 * @returns {Promise<{bytes: Uint8Array, reachedTarget: boolean, attempts: number, pages: number}>}
 */
export async function compressToTarget(srcBytes, targetBytes, onProgress = () => {}) {
  const pdf = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
  const numPages = pdf.numPages;

  // Original page sizes in points (1pt = 1/72in) — preserved in the output.
  const pageSizes = [];
  let maxPt = 0;
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const v = page.getViewport({ scale: 1 });
    pageSizes.push({ width: v.width, height: v.height });
    maxPt = Math.max(maxPt, v.width, v.height);
    page.cleanup();
  }

  const startScale = Math.min(2, MAX_RENDER_DIM / (maxPt || 1000));
  let scale = Math.max(startScale, 0.5);
  let quality = 0.8;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  let best = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const out = await PDFDocument.create();

    for (let i = 1; i <= numPages; i++) {
      onProgress({ phase: 'render', attempt, page: i, numPages, currentBytes: 0 });

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, background: '#FFFFFF' }).promise;
      page.cleanup();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      const jpgBytes = new Uint8Array(await blob.arrayBuffer());

      const img = await out.embedJpg(jpgBytes);
      const { width, height } = pageSizes[i - 1];
      const outPage = out.addPage([width, height]);
      outPage.drawImage(img, { x: 0, y: 0, width, height });
    }

    onProgress({ phase: 'build', attempt, page: numPages, numPages, currentBytes: 0 });
    const bytes = await out.save({ useObjectStreams: true });

    if (!best || bytes.byteLength < best.byteLength) best = bytes;
    onProgress({ phase: 'check', attempt, page: numPages, numPages, currentBytes: bytes.byteLength });

    if (bytes.byteLength <= targetBytes) {
      await pdf.destroy();
      return { bytes, reachedTarget: true, attempts: attempt, pages: numPages };
    }

    // Tune down for next attempt: first quality, then resolution.
    if (quality > 0.34) {
      quality = Math.max(quality - 0.14, MIN_QUALITY);
    } else {
      scale *= 0.8;
      quality = 0.55;
      if (scale < MIN_SCALE) break;
    }
  }

  await pdf.destroy();
  return { bytes: best, reachedTarget: best.byteLength <= targetBytes, attempts: MAX_ATTEMPTS, pages: numPages };
}
