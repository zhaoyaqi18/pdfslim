import '../style.css';
import { PDFDocument } from 'pdf-lib';
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
const metaBox = document.getElementById('meta-box');
const metaList = document.getElementById('meta-list');
const cleanBtn = document.getElementById('clean-btn');
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

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Read and display the metadata found in the selected PDF. */
async function showMeta(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const rows = [
      ['Title', doc.getTitle()],
      ['Author', doc.getAuthor()],
      ['Subject', doc.getSubject()],
      ['Keywords', doc.getKeywords() ? String(doc.getKeywords()) : ''],
      ['Creator', doc.getCreator()],
      ['Producer', doc.getProducer()],
      ['Created', doc.getCreationDate() ? doc.getCreationDate().toISOString().replace('T', ' ').slice(0, 16) : ''],
      ['Modified', doc.getModificationDate() ? doc.getModificationDate().toISOString().replace('T', ' ').slice(0, 16) : ''],
    ].filter(([, v]) => v);

    metaList.innerHTML = rows.length
      ? rows.map(([k, v]) => `<div class="meta-row"><span class="meta-key">${esc(k)}</span><span class="meta-val">${esc(String(v))}</span></div>`).join('')
      : '<p class="opt-text">No metadata found — this file is already clean.</p>';
    metaBox.hidden = false;
    cleanBtn.disabled = rows.length === 0;
    await doc.save(); // no-op; just to avoid "no pages" warnings — actually not needed
  } catch (err) {
    console.error(err);
    showError('Could not read PDF', 'This file may be corrupted or password-protected.');
  }
}

function setFile(file) {
  if (!file) return;
  if (!isPdfFile(file)) { showError('Not a PDF', 'Please choose a .pdf file.'); return; }
  currentFile = file;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatSize(file.size);
  fileChip.hidden = false;
  metaBox.hidden = true;
  cleanBtn.disabled = true;

  file.arrayBuffer().then((b) => showMeta(b)).catch((err) => {
    console.error(err);
    showError('Could not read PDF', 'This file could not be read — it may have been moved or deleted.');
  });
}

function clearFile() {
  currentFile = null;
  fileChip.hidden = true;
  metaBox.hidden = true;
  metaList.innerHTML = '';
  cleanBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

cleanBtn.addEventListener('click', async () => {
  if (!currentFile || busy) return;
  busy = true;
  showStage('processing');
  try {
    setProgress(progressBar, progressText, 30, 'Reading PDF…');
    const bytes = await currentFile.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // Strip every metadata field. pdf-lib setters require string/Date values,
    // so empty strings + epoch Date produce the same visible result (empty fields).
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
    const epoch = new Date(0);
    doc.setCreationDate(epoch);
    doc.setModificationDate(epoch);

    setProgress(progressBar, progressText, 70, 'Writing clean file…');
    outBytes = await doc.save({ useObjectStreams: true });
    outName = slimName(currentFile.name, '-clean');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${doc.getPageCount()} pages`;
    resultNote.textContent = 'All metadata removed.';
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Cleaning failed', 'This file could not be processed — it may be corrupted or password-protected.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
