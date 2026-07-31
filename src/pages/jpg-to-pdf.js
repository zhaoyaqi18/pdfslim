import '../style.css';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  initTheme, formatSize, downloadBytes, wireDrop,
  stageSwitcher, setProgress,
  initDelight, addProcessedBytes,
} from '../shared.js';

initTheme();
initDelight();

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const listNote = document.getElementById('list-note');
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

const IMG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

/** @type {File[]} */
let files = [];
let outBytes = null;
let outName = 'images.pdf';
let outType = 'application/pdf';
let busy = false;

// Keep radio label styling in sync
document.querySelectorAll('input[name="outmode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.opt-radio').forEach((l) => l.classList.remove('checked'));
    radio.closest('.opt-radio').classList.add('checked');
  });
});

function isImage(file) {
  return file && (/^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name));
}

function renderList() {
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.innerHTML = `${IMG_ICON}<span class="fl-name" title=""></span><span class="fl-size">${formatSize(f.size)}</span>`;
    const nameEl = li.querySelector('.fl-name');
    nameEl.textContent = f.name;
    nameEl.title = f.name;

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
  convertBtn.disabled = files.length < 1;
  convertBtn.textContent = files.length > 1 ? `Convert ${files.length} images to PDF` : 'Convert to PDF';
}

wireDrop({
  zone: dropzone,
  input: fileInput,
  onFiles: (incoming) => {
    const images = incoming.filter(isImage);
    if (images.length < incoming.length) {
      showError('Only JPG or PNG', 'One or more files were skipped — only .jpg, .jpeg and .png are supported.');
      setTimeout(() => showStage('input'), 2500);
    }
    files.push(...images);
    renderList();
  },
});

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

async function embedAsPage(out, file) {
  const bytes = await file.arrayBuffer();
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  // 1px at 96dpi = 0.75pt — keeps images at natural size.
  const width = img.width * 0.75;
  const height = img.height * 0.75;
  const page = out.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
}

convertBtn.addEventListener('click', async () => {
  if (files.length < 1 || busy) return;
  busy = true;
  showStage('processing');
  try {
    const mode = document.querySelector('input[name="outmode"]:checked').value;

    if (mode === 'separate') {
      const zip = new JSZip();
      const usedNames = new Set();
      for (let i = 0; i < files.length; i++) {
        setProgress(progressBar, progressText, (i / files.length) * 90, `Converting ${files[i].name} (${i + 1} of ${files.length})…`);
        const out = await PDFDocument.create();
        await embedAsPage(out, files[i]);
        const bytes = await out.save({ useObjectStreams: true });

        const base = (files[i].name || 'image').replace(/\.[^.]+$/, '');
        let pdfName = `${base}.pdf`;
        for (let n = 2; usedNames.has(pdfName); n++) pdfName = `${base}-${n}.pdf`;
        usedNames.add(pdfName);
        zip.file(pdfName, bytes);
      }
      setProgress(progressBar, progressText, 95, 'Packing ZIP…');
      outBytes = await zip.generateAsync({ type: 'uint8array' });
      outName = 'images-pdf.zip';
      outType = 'application/zip';
      resultPages.textContent = `${files.length} PDF${files.length === 1 ? '' : 's'}`;
    } else {
      const out = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        setProgress(progressBar, progressText, (i / files.length) * 90, `Adding ${files[i].name} (${i + 1} of ${files.length})…`);
        await embedAsPage(out, files[i]);
      }
      setProgress(progressBar, progressText, 95, 'Saving…');
      outBytes = await out.save({ useObjectStreams: true });
      outName = 'images.pdf';
      outType = 'application/pdf';
      resultPages.textContent = `${files.length} page${files.length === 1 ? '' : 's'}`;
    }

    addProcessedBytes(files.reduce((sum, f) => sum + f.size, 0));
    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Conversion failed', 'One of the images could not be read — it may be corrupted or in an unsupported encoding.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName, outType);
});
againBtn.addEventListener('click', () => { files = []; outBytes = null; renderList(); showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
