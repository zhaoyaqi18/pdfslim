import '../style.css';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
const startNum = document.getElementById('start-num');
const spreadOrder = document.getElementById('spread-order');
const numberBtn = document.getElementById('number-btn');
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

document.querySelectorAll('input[name="pos"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
    // Spread options reveal the numbering-order group
    const spread = radio.value === 'spread-bottom' || radio.value === 'spread-sides';
    spreadOrder.hidden = !spread;
  });
});
document.querySelectorAll('input[name="spread-order"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('#spread-order .opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
  });
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
  numberBtn.disabled = false;
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  numberBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

numberBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  busy = true;
  showStage('processing');
  try {
    const pos = document.querySelector('input[name="pos"]:checked').value;
    const start = Math.max(0, Math.min(9999, Number(startNum.value) || 1));
    const spreadOrderVal = document.querySelector('input[name="spread-order"]:checked').value;
    setProgress(progressBar, progressText, 20, 'Reading PDF…');
    const bytes = await currentFile.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const color = rgb(0.15, 0.15, 0.15);
    const size = 10;
    const isSpread = pos === 'spread-bottom' || pos === 'spread-sides';

    pages.forEach((page, idx) => {
      let { width, height } = page.getSize();
      if (!Number.isFinite(width) || width < 1) width = 595;
      if (!Number.isFinite(height) || height < 1) height = 842;
      const margin = 28;

      if (isSpread) {
        // Spread pages: number the left and right halves independently.
        const leftNum = String(start + idx * 2 + (spreadOrderVal === 'rl' ? 1 : 0));
        const rightNum = String(start + idx * 2 + (spreadOrderVal === 'rl' ? 0 : 1));
        const leftW = font.widthOfTextAtSize(leftNum, size);
        const rightW = font.widthOfTextAtSize(rightNum, size);

        if (pos === 'spread-bottom') {
          page.drawText(leftNum, { x: margin, y: margin, size, font, color });
          page.drawText(rightNum, { x: width - rightW - margin, y: margin, size, font, color });
        } else {
          // sides: middle of the left / right edges
          page.drawText(leftNum, { x: margin, y: height / 2 - size / 2, size, font, color });
          page.drawText(rightNum, { x: width - rightW - margin, y: height / 2 - size / 2, size, font, color });
        }
      } else {
        const num = String(start + idx);
        const textWidth = font.widthOfTextAtSize(num, size);

        let x, y;
        if (pos === 'bottom-center') {
          x = (width - textWidth) / 2;
          y = margin;
        } else if (pos === 'bottom-right') {
          x = width - textWidth - margin;
          y = margin;
        } else {
          x = width - textWidth - margin;
          y = height - margin - size;
        }

        page.drawText(num, { x, y, size, font, color });
      }
      setProgress(progressBar, progressText, 20 + ((idx + 1) / pages.length) * 70, `Numbering page ${idx + 1} of ${pages.length}…`);
    });

    outBytes = await doc.save({ useObjectStreams: true });
    outName = slimName(currentFile.name, '-numbered');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Numbering failed', 'This file could not be read — it may be corrupted or password-protected.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
