import '../style.css';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
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
const pageCountNote = document.getElementById('page-count');
const splitOptions = document.getElementById('split-options');
const rangeFrom = document.getElementById('range-from');
const rangeTo = document.getElementById('range-to');
const splitBtn = document.getElementById('split-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultName = document.getElementById('result-name');
const resultSize = document.getElementById('result-size');
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

let currentFile = null;
let currentBytes = null;
let numPages = 0;
let outBytes = null;
let outName = '';
let outType = 'application/pdf';
let busy = false;

// Keep radio label styling in sync
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
  });
});

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

async function setFile(file) {
  if (!file) return;
  if (!isPdfFile(file)) { showError('Not a PDF', 'Please choose a .pdf file.'); return; }
  try {
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    numPages = doc.getPageCount();
    currentFile = file;
    currentBytes = bytes;

    fileName.textContent = file.name;
    fileName.title = file.name;
    fileSize.textContent = formatSize(file.size);
    fileChip.hidden = false;
    pageCountNote.hidden = false;
    pageCountNote.textContent = `This PDF has ${numPages} page${numPages === 1 ? '' : 's'}.`;
    splitOptions.hidden = false;
    rangeFrom.max = numPages;
    rangeTo.max = numPages;
    rangeFrom.value = 1;
    rangeTo.value = numPages;
    splitBtn.disabled = false;
  } catch (err) {
    console.error(err);
    showError('Cannot read this PDF', 'The file may be corrupted or password-protected.');
  }
}

function clearFile() {
  currentFile = null;
  currentBytes = null;
  numPages = 0;
  fileChip.hidden = true;
  pageCountNote.hidden = true;
  splitOptions.hidden = true;
  splitBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

splitBtn.addEventListener('click', async () => {
  if (!currentBytes || busy) return;
  busy = true;
  showStage('processing');
  try {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const src = await PDFDocument.load(currentBytes.slice(0), { ignoreEncryption: true });

    if (mode === 'range') {
      let from = Math.max(1, Math.min(numPages, Number(rangeFrom.value) || 1));
      let to = Math.max(1, Math.min(numPages, Number(rangeTo.value) || numPages));
      if (from > to) [from, to] = [to, from];

      setProgress(progressBar, progressText, 40, `Extracting pages ${from}–${to}…`);
      const out = await PDFDocument.create();
      const indices = [];
      for (let p = from - 1; p <= to - 1; p++) indices.push(p);
      const pages = await out.copyPages(src, indices);
      pages.forEach((p) => out.addPage(p));
      outBytes = await out.save({ useObjectStreams: true });
      outType = 'application/pdf';
      outName = slimName(currentFile.name, `-pages-${from}-${to}`);
    } else {
      const zip = new JSZip();
      const base = (currentFile.name || 'document').replace(/\.pdf$/i, '');
      for (let p = 0; p < numPages; p++) {
        setProgress(progressBar, progressText, (p / numPages) * 90, `Splitting page ${p + 1} of ${numPages}…`);
        const out = await PDFDocument.create();
        const [page] = await out.copyPages(src, [p]);
        out.addPage(page);
        const bytes = await out.save({ useObjectStreams: true });
        zip.file(`${base}-page-${p + 1}.pdf`, bytes);
      }
      setProgress(progressBar, progressText, 95, 'Packing ZIP…');
      outBytes = await zip.generateAsync({ type: 'uint8array' });
      outType = 'application/zip';
      outName = slimName(currentFile.name, '-pages', '.zip');
    }

    addProcessedBytes(currentFile.size);
    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Split failed', 'Something went wrong while splitting this file.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName, outType);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
