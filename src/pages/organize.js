import '../style.css';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Sortable from 'sortablejs';
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
const pageTools = document.getElementById('page-tools');
const pageGrid = document.getElementById('page-grid');
const pageCountNote = document.getElementById('page-count-note');
const organizeBtn = document.getElementById('organize-btn');
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

let currentFile = null;
let srcBytes = null;
let pages = [];       // { index, rotation } — rotation in degrees (0/90/180/270)
let outBytes = null;
let outName = '';
let busy = false;

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage('error');
}

/* ============ Thumbnail rendering (once, then cached) ============ */
let pdfDoc = null; // pdfjs document proxy (kept open while organizing)
const THUMB_W = 140;

/** Render a single page's thumbnail canvas. Called once per page on load. */
async function renderThumbCanvas(pageIndex) {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = THUMB_W / base.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  canvas.className = 'page-thumb';
  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise;
  page.cleanup();
  return canvas;
}

/** Build the full page grid once. Thumbnails are cached in each card's data. */
async function buildGrid() {
  pageGrid.innerHTML = '';
  pageGrid.hidden = false;
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderThumbCanvas(pages[i].index);
    const card = createCard(pages[i], canvas, i);
    pageGrid.appendChild(card);
  }
  syncFromDom();
  updateCountNote();
}

function createCard(pageData, canvas, pos) {
  const card = document.createElement('div');
  card.className = 'page-card';
  card.dataset.srcIndex = pageData.index;
  card.dataset.rotation = pageData.rotation;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'page-card-thumb';
  thumbWrap.appendChild(canvas);

  const label = document.createElement('div');
  label.className = 'page-card-label';

  const actions = document.createElement('div');
  actions.className = 'page-card-actions';
  const btns = [
    ['left', '←', 'Move left'],
    ['right', '→', 'Move right'],
    ['rotate', '↻', 'Rotate 90°'],
    ['delete', '×', 'Delete page'],
  ];
  for (const [act, glyph, tip] of btns) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = act === 'delete' ? 'fl-btn danger' : 'fl-btn';
    b.textContent = glyph;
    b.title = tip;
    b.dataset.act = act;
    b.addEventListener('click', (e) => { e.stopPropagation(); handleAction(act, card); });
    actions.appendChild(b);
  }

  card.append(thumbWrap, label, actions);
  return card;
}

/* ============ DOM-level operations (no re-render) ============ */
function handleAction(act, card) {
  if (act === 'left') {
    const prev = card.previousElementSibling;
    if (prev) pageGrid.insertBefore(card, prev);
  } else if (act === 'right') {
    const next = card.nextElementSibling;
    if (next) pageGrid.insertBefore(next, card);
  } else if (act === 'rotate') {
    const rot = (Number(card.dataset.rotation) + 90) % 360;
    card.dataset.rotation = rot;
    card.querySelector('.page-card-thumb').style.transform = `rotate(${rot}deg)`;
  } else if (act === 'delete') {
    card.remove();
  }
  syncFromDom();
  updateCountNote();
}

/** Sync the pages[] data model from the current DOM order (single source of truth = DOM). */
function syncFromDom() {
  const cards = Array.from(pageGrid.querySelectorAll('.page-card'));
  pages = cards.map((card) => ({
    index: Number(card.dataset.srcIndex),
    rotation: Number(card.dataset.rotation) || 0,
  }));
  // Refresh labels (page position numbers)
  cards.forEach((card, i) => {
    card.querySelector('.page-card-label').textContent = String(i + 1);
  });
}

function updateCountNote() {
  pageCountNote.textContent = pages.length === 0
    ? 'All pages removed — add nothing to keep the original?'
    : `${pages.length} page${pages.length === 1 ? '' : 's'} in the document. Drag to reorder, or use the buttons.`;
  organizeBtn.disabled = pages.length === 0;
}

/* ============ Drag & drop sorting ============ */
let sortable = null;

function initSortable() {
  if (sortable) sortable.destroy();
  sortable = Sortable.create(pageGrid, {
    animation: 150,
    ghostClass: 'page-card-ghost',
    chosenClass: 'page-card-chosen',
    dragClass: 'page-card-dragging',
    handle: '.page-card-thumb',
    onEnd: () => {
      syncFromDom();
      updateCountNote();
    },
  });
}

/* ============ File intake ============ */
async function setFile(file) {
  if (!file) return;
  if (!isPdfFile(file)) { showError('Not a PDF', 'Please choose a .pdf file.'); return; }
  currentFile = file;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatSize(file.size);
  fileChip.hidden = false;
  fileInput.disabled = true;

  try {
    srcBytes = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    pages = Array.from({ length: pdfDoc.numPages }, (_, i) => ({ index: i, rotation: 0 }));
    pageTools.hidden = false;
    await buildGrid();
    initSortable();
  } catch (err) {
    console.error(err);
    showError('Could not read PDF', 'This file may be corrupted or password-protected.');
  }
}

function clearFile() {
  currentFile = null;
  srcBytes = null;
  pages = [];
  if (pdfDoc) { try { pdfDoc.destroy(); } catch {} pdfDoc = null; }
  if (sortable) { sortable.destroy(); sortable = null; }
  fileChip.hidden = true;
  pageTools.hidden = true;
  pageGrid.innerHTML = '';
  fileInput.disabled = false;
  organizeBtn.disabled = true;
}

wireDrop({ zone: dropzone, input: fileInput, onFiles: (f) => setFile(f[0]) });
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

/* ============ Rebuild ============ */
organizeBtn.addEventListener('click', async () => {
  if (!currentFile || busy || !pages.length) return;
  busy = true;
  showStage('processing');
  try {
    setProgress(progressBar, progressText, 15, 'Loading document…');
    const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      const { index, rotation } = pages[i];
      const [copied] = await out.copyPages(doc, [index]);
      if (rotation !== 0) {
        const current = copied.getRotation().angle;
        copied.setRotation(degrees((current + rotation) % 360));
      }
      out.addPage(copied);
      setProgress(progressBar, progressText, 15 + ((i + 1) / total) * 75, `Adding page ${i + 1} of ${total}…`);
    }

    outBytes = await out.save({ useObjectStreams: true });
    outName = slimName(currentFile.name, '-organized');
    addProcessedBytes(currentFile.size);

    setProgress(progressBar, progressText, 100, 'Done');
    resultName.textContent = outName;
    resultName.title = outName;
    resultSize.textContent = formatSize(outBytes.byteLength);
    resultPages.textContent = `${total} page${total === 1 ? '' : 's'}`;
    showStage('done');
  } catch (err) {
    console.error(err);
    showError('Could not rebuild PDF', 'Something went wrong while rebuilding the document.');
  } finally {
    busy = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (outBytes) downloadBytes(outBytes, outName);
});
againBtn.addEventListener('click', () => { clearFile(); outBytes = null; showStage('input'); });
errorRetry.addEventListener('click', () => showStage('input'));
