import '../style.css';
import { PDFDocument } from 'pdf-lib';
import {
  initTheme, formatSize, downloadBytes, wireDrop,
  stageSwitcher, setProgress, isPdfFile,
  initDelight, addProcessedBytes,
} from '../shared.js';

initTheme();
initDelight();

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const listNote = document.getElementById('list-note');
const mergeBtn = document.getElementById('merge-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
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

/** @type {File[]} */
let files = [];
let outBytes = null;
let busy = false;

const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

function renderList() {
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.innerHTML = `${FILE_ICON}<span class="fl-name" title="${f.name}"></span><span class="fl-size">${formatSize(f.size)}</span>`;
    li.querySelector('.fl-name').textContent = f.name;

    const actions = document.createElement('span');
    actions.className = 'fl-actions';

    const up = document.createElement('button');
    up.className = 'fl-btn'; up.type = 'button'; up.textContent = '↑'; up.title = 'Move up';
    up.disabled = i === 0;
    up.addEventListener('click', () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; renderList(); });

    const down = document.createElement('button');
    down.className = 'fl-btn'; down.type = 'button'; down.textContent = '↓'; down.title = 'Move down';
    down.disabled = i === files.length - 1;
    down.addEventListener('click', () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; renderList(); });

    const rm = document.createElement('button');
    rm.className = 'fl-btn danger'; rm.type = 'button'; rm.textContent = '×'; rm.title = 'Remove';
    rm.addEventListener('click', () => { files.splice(i, 1); renderList(); });

    actions.append(up, down, rm);
    li.appendChild(actions);
    fileList.appendChild(li);
  });

  listNote.hidden = files.length < 2;
  mergeBtn.disabled = files.length < 2;
  mergeBtn.textContent = files.length >= 2 ? `Merge ${files.length} PDFs` : 'Merge PDFs';
}

wireDrop({
  zone: dropzone,
  input: fileInput,
  onFiles: (incoming) => {
    const pdfs = incoming.filter(isPdfFile);
    if (pdfs.length < incoming.length) {
      showError('Only PDFs, please', 'One or more files were skipped because they are not PDF files.');
      setTimeout(() => showStage('input'), 2500);
    }
    files.push(...pdfs);
    renderList();
  },
});

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

mergeBtn.addEventListener('click', async () => {
  if (files.length < 2 || busy) return;
  busy = true;
  showStage('processing');
  try {
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setProgress(progressBar, progressText, (i / files.length) * 90, `Adding ${files[i].name} (${i + 1} of ${files.length})…`);
      const bytes = await files[i].arrayBuffer();
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    setProgress(progressBar, progressText, 95, 'Saving…');
    outBytes = await out.save({ useObjectStreams: true });
    addProcessedBytes(files.reduce((sum, f) => sum + f.size, 0));
    setProgress(progressBar, progressText, 100, 'Done');
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${out.getPageCount()} pages`;
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Merge failed', 'One of the files could not be read — it may be corrupted or password-protected. Remove it and try again.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, 'merged.pdf');
});
againBtn.addEventListener('click', () => { files = []; outBytes = null; renderList(); showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
