import '../style.css';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import {
  initTheme, formatSize, downloadBytes, wireDrop,
  stageSwitcher, setProgress, isPdfFile, slimName,
  initDelight, addProcessedBytes,
} from '../shared.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
initTheme();
initDelight();

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileChip = document.getElementById('file-chip');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const fileRemove = document.getElementById('file-remove');
const convertBtn = document.getElementById('convert-btn');
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

document.querySelectorAll('input[name="scale"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
  });
});

let currentFile = null;
let outBytes = null;
let outName = '';
let outType = 'image/jpeg';
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
  convertBtn.disabled = false;
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  convertBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

convertBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  busy = true;
  showStage('processing');
  try {
    const scale = Number(document.querySelector('input[name="scale"]:checked').value) || 2;
    const bytes = await currentFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdf.numPages;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const base = (currentFile.name || 'document').replace(/\.pdf$/i, '');
    const images = [];

    for (let i = 1; i <= numPages; i++) {
      setProgress(progressBar, progressText, (i / numPages) * 85, `Rendering page ${i} of ${numPages}…`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, background: '#FFFFFF' }).promise;
      page.cleanup();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      images.push({ name: `${base}-page-${i}.jpg`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
    await pdf.destroy();

    if (images.length === 1) {
      outBytes = images[0].bytes;
      outName = images[0].name;
      outType = 'image/jpeg';
    } else {
      setProgress(progressBar, progressText, 92, 'Packing ZIP…');
      const zip = new JSZip();
      images.forEach((img) => zip.file(img.name, img.bytes));
      outBytes = await zip.generateAsync({ type: 'uint8array' });
      outName = `${base}-images.zip`;
      outType = 'application/zip';
    }

    addProcessedBytes(currentFile.size);
    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${numPages} page${numPages === 1 ? '' : 's'}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    if (err && err.name === 'PasswordException') {
      showError('Password-protected PDF', 'This PDF is encrypted. Remove the password first, then try again.');
    } else {
      showError('Conversion failed', 'Something went wrong while converting this file.');
    }
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName, outType);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
