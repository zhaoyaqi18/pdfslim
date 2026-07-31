import '../style.css';
import { PDFDocument, degrees } from 'pdf-lib';
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
const rotateBtn = document.getElementById('rotate-btn');
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

document.querySelectorAll('input[name="deg"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
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
  rotateBtn.disabled = false;
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  rotateBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

rotateBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  busy = true;
  showStage('processing');
  try {
    const deg = Number(document.querySelector('input[name="deg"]:checked').value) || 90;
    setProgress(progressBar, progressText, 30, 'Reading PDF…');
    const bytes = await currentFile.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();

    setProgress(progressBar, progressText, 60, `Rotating ${pages.length} page${pages.length === 1 ? '' : 's'}…`);
    pages.forEach((page) => {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + deg) % 360));
    });

    outBytes = await doc.save({ useObjectStreams: true });
    outName = slimName(currentFile.name, '-rotated');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Rotation failed', 'This file could not be read — it may be corrupted or password-protected.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
