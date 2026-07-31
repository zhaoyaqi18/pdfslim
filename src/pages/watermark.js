import '../style.css';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  initTheme, formatSize, downloadBytes, wireDrop,
  stageSwitcher, setProgress, isPdfFile, slimName,
  initDelight, addProcessedBytes,
} from '../shared.js';

initTheme();
initDelight();

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileChip = document.getElementById('file-chip');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const fileRemove = document.getElementById('file-remove');
const wmText = document.getElementById('wm-text');
const wmOpacity = document.getElementById('wm-opacity');
const wmOpacityVal = document.getElementById('wm-opacity-val');
const watermarkBtn = document.getElementById('watermark-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultName = document.getElementById('result-name');
const resultSize = document.getElementById('result-size');
const resultPages = document.getElementById('result-pages');
const downloadBtn = document.getElementById('download-btn');
const againBtn = document.getElementById('again-btn');
const errorTitle = document.getElementById('error-title');
const errorBody = document.getElementById('error-body');
const errorRetry = document.getElementById('error-retry');

const showStage = stageSwitcher({
  input: document.getElementById('stage-input'),
  processing: document.getElementById('stage-processing'),
  done: document.getElementById('stage-done'),
  error: document.getElementById('stage-error'),
});

document.querySelectorAll('input[name="wm-style"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
  });
});

wmOpacity.addEventListener('input', () => {
  wmOpacityVal.textContent = `${wmOpacity.value}%`;
});
wmText.addEventListener('input', () => {
  watermarkBtn.disabled = !(currentFile && wmText.value.trim());
});

let currentFile = null;
let outBytes = null;
let outName = '';
let busy = false;

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

function setFile(file) {
  if (!file) return;
  if (!isPdfFile(file)) { showError('Not a PDF', 'Please choose a .pdf file.'); return; }
  currentFile = file;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatSize(file.size);
  fileChip.hidden = false;
  watermarkBtn.disabled = !wmText.value.trim();
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  watermarkBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

watermarkBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  const text = wmText.value.trim();
  if (!text) { showError('Missing text', 'Type some watermark text first.'); return; }
  busy = true;
  showStage('processing');
  try {
    const opacity = Number(wmOpacity.value) / 100;
    const style = document.querySelector('input[name="wm-style"]:checked').value;
    setProgress(progressBar, progressText, 20, 'Reading PDF…');
    const bytes = await currentFile.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const color = rgb(0.25, 0.25, 0.25);

    // Pre-flight: standard PDF fonts only support basic Latin characters.
    // Fail with a clear message instead of a generic error deep in drawText.
    try {
      font.encodeText(text);
    } catch {
      throw new Error('unsupported-chars');
    }

    pages.forEach((page, idx) => {
      let { width, height } = page.getSize();
      // Some scanned/generated PDFs have broken MediaBox (0 or NaN) — fall back to A4.
      if (!Number.isFinite(width) || width < 1) width = 595;
      if (!Number.isFinite(height) || height < 1) height = 842;
      setProgress(progressBar, progressText, 20 + ((idx + 1) / pages.length) * 70, `Watermarking page ${idx + 1} of ${pages.length}…`);

      if (style === 'diagonal') {
        const size = Math.max(width, height) / (text.length > 12 ? 10 : 8);
        page.drawText(text, {
          x: width * 0.5 - size * text.length * 0.28,
          y: height * 0.5 - size * 0.3,
          size,
          font,
          color,
          opacity,
          rotate: degrees(-45),
        });
      } else if (style === 'horizontal') {
        const size = Math.min(width, height) / (text.length > 12 ? 18 : 14);
        page.drawText(text, {
          x: width * 0.5 - size * text.length * 0.26,
          y: height * 0.5 - size * 0.4,
          size,
          font,
          color,
          opacity,
        });
      } else {
        // tiled: repeat text across the page in a grid, slightly rotated
        const size = Math.min(width, height) / (text.length > 12 ? 16 : 12);
        const stepX = size * text.length * 1.05;
        const stepY = size * 2.4;
        for (let y = -height; y < height * 2; y += stepY) {
          for (let x = -width; x < width * 2; x += stepX) {
            page.drawText(text, {
              x, y, size, font, color,
              opacity: opacity * 0.6,
              rotate: degrees(-30),
            });
          }
        }
      }
    });

    outBytes = await doc.save({ useObjectStreams: true });
    outName = slimName(currentFile.name, '-watermarked');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    if (err && err.message === 'unsupported-chars') {
      showError('Unsupported characters', 'Watermark text can only use basic Latin letters, numbers and punctuation (A–Z, 0–9). Chinese, emoji and special symbols are not supported by standard PDF fonts.');
    } else {
      const detail = (err && err.message) ? ` (${err.message})` : '';
      showError('Watermark failed', `This file could not be processed${detail} — it may be corrupted or password-protected.`);
    }
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
