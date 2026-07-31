import '../style.css';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
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
const pw1 = document.getElementById('pw1');
const pw2 = document.getElementById('pw2');
const noPrint = document.getElementById('no-print');
const noCopy = document.getElementById('no-copy');
const protectBtn = document.getElementById('protect-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultName = document.getElementById('result-name');
const resultSize = document.getElementById('result-size');
const resultPages = document.getElementById('result-pages');
const resultNote = document.getElementById('result-note');
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
let outBytes = null;
let outName = '';
let busy = false;

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

function updateBtn() {
  const ok = currentFile && pw1.value.length >= 4 && pw1.value === pw2.value;
  protectBtn.disabled = !ok;
}

function setFile(file) {
  if (!file) return;
  if (!isPdfFile(file)) { showError('Not a PDF', 'Please choose a .pdf file.'); return; }
  currentFile = file;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatSize(file.size);
  fileChip.hidden = false;
  updateBtn();
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  updateBtn();
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });
pw1.addEventListener('input', updateBtn);
pw2.addEventListener('input', updateBtn);

protectBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  const password = pw1.value;
  if (password.length < 4) { showError('Password too short', 'Use at least 4 characters.'); return; }
  if (password !== pw2.value) { showError('Passwords do not match', 'Please type the same password twice.'); return; }
  busy = true;
  showStage('processing');
  try {
    setProgress(progressBar, progressText, 30, 'Reading PDF…');
    const bytes = new Uint8Array(await currentFile.arrayBuffer());

    setProgress(progressBar, progressText, 60, 'Encrypting…');
    outBytes = await encryptPDF(bytes, password, {
      ownerPassword: password,
      allowPrinting: !noPrint.checked,
      allowCopying: !noCopy.checked,
    });

    outName = slimName(currentFile.name, '-protected');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `password-protected`;
    resultNote.textContent = `Password: ${password}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Protection failed', 'This file could not be encrypted — it may be corrupted or already protected.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); pw1.value = ''; pw2.value = ''; outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
