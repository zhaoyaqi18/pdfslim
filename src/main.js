import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { compressToTarget } from './compressor.js';
import { initDelight, addProcessedBytes, celebrate, downloadBytes } from './shared.js';

initDelight();

/* ================= Theme ================= */
const rootEl = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  rootEl.setAttribute('data-theme', theme);
  try { localStorage.setItem('pdfslim-theme', theme); } catch { /* ignore */ }
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('pdfslim-theme'); } catch { /* ignore */ }
  applyTheme(saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
})();
themeToggle.addEventListener('click', () => {
  applyTheme(rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

/* ================= Elements ================= */
const dropzone = document.getElementById('dropzone');
const dropzoneTitle = dropzone.querySelector('.dropzone-title');
const fileInput = document.getElementById('file-input');
const fileChip = document.getElementById('file-chip');
const fileThumb = document.getElementById('file-thumb');
const fileChipIcon = document.getElementById('file-chip-icon');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const fileRemove = document.getElementById('file-remove');
const batchList = document.getElementById('batch-list');
const batchNote = document.getElementById('batch-note');
const presetGroup = document.getElementById('preset-group');
const customSize = document.getElementById('custom-size');
const customUnit = document.getElementById('custom-unit');
const compressBtn = document.getElementById('compress-btn');
const sizeHint = document.getElementById('size-hint');

const stageInput = document.getElementById('stage-input');
const stageProcessing = document.getElementById('stage-processing');
const stageDone = document.getElementById('stage-done');
const stageError = document.getElementById('stage-error');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const procOriginal = document.getElementById('proc-original');
const procTarget = document.getElementById('proc-target');
const tipText = document.getElementById('tip-text');

const doneTitle = document.getElementById('done-title');
const resultQuip = document.getElementById('result-quip');
const cmpBefore = document.getElementById('cmp-before');
const cmpAfter = document.getElementById('cmp-after');
const cmpAfterFill = document.getElementById('cmp-after-fill');
const resultCardSingle = document.getElementById('result-card-single');
const resultName = document.getElementById('result-name');
const resultSize = document.getElementById('result-size');
const resultSaved = document.getElementById('result-saved');
const batchResultList = document.getElementById('batch-result-list');
const resultNote = document.getElementById('result-note');
const downloadBtn = document.getElementById('download-btn');
const downloadZipBtn = document.getElementById('download-zip-btn');
const againBtn = document.getElementById('again-btn');
const resizeGroup = document.getElementById('resize-group');

const errorTitle = document.getElementById('error-title');
const errorBody = document.getElementById('error-body');
const errorRetry = document.getElementById('error-retry');

/* ================= State ================= */
let currentFile = null;       // single-file mode
let currentBytes = null;
let batchMode = false;
let batchFiles = [];          // File[]
let batchResults = [];        // { name, bytes, original, final, note }
let batchZip = null;          // Uint8Array
let batchZipName = 'pdf-slim.zip';
let targetKb = 100;
let busy = false;
let downloadUrl = null;
let tipTimer = null;

/* Long-tail SEO pages can preset a target via <body data-default-kb="300"> */
(function initDefaultTarget() {
  const kb = Number(document.body.dataset.defaultKb);
  if (!kb || !Number.isFinite(kb)) return;
  const btn = presetGroup.querySelector(`[data-kb="${kb}"]`);
  if (btn) {
    presetGroup.querySelectorAll('.preset').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    targetKb = kb;
  } else {
    presetGroup.querySelectorAll('.preset').forEach((b) => b.classList.remove('active'));
    if (kb >= 1024 && kb % 1024 === 0) {
      customSize.value = kb / 1024;
      customUnit.value = '1024';
    } else {
      customSize.value = kb;
      customUnit.value = '1';
    }
  }
})();

/* ================= Copy ================= */
const DROP_IDLE = 'Drop your PDF here';
const DROP_READY = 'PDF ready — or drop another for batch mode';
const DROP_FUN = "Drop it like it's heavy";

const QUIPS_BIG = [
  'It basically did cardio.',
  'Your upload portal will never know what hit it.',
  'Same document, lighter carry-on.',
  'Took off the winter coat.',
];
const QUIPS_SMALL = [
  'Already lean — we just tidied it up.',
  'Not much fat to trim on this one.',
];
const QUIP_ALREADY = 'It arrived in great shape.';

const TIPS = [
  'This is happening entirely in your browser. No data is being sent to any server.',
  'Want proof? Open DevTools (F12) → Network tab. You will see zero uploads.',
  'Image-heavy PDFs compress the most. Text-only pages have less room to shrink.',
  'You can disconnect from the internet right now — compression would still work.',
  'Batch mode is free here. Some tools charge a subscription for exactly this.',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/* ================= Helpers ================= */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showStage(stage) {
  for (const el of [stageInput, stageProcessing, stageDone, stageError]) el.hidden = el !== stage;
}

function getTargetBytes() {
  if (customSize.value && Number(customSize.value) > 0) {
    return Math.round(Number(customSize.value) * Number(customUnit.value)) * 1024;
  }
  return targetKb * 1024;
}

function isPdf(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

function startTips() {
  let i = 0;
  tipText.textContent = TIPS[0];
  tipTimer = setInterval(() => {
    i = (i + 1) % TIPS.length;
    tipText.textContent = TIPS[i];
  }, 4000);
}
function stopTips() {
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
}

function updateCompressBtn() {
  if (batchMode) {
    compressBtn.disabled = batchFiles.length === 0;
    compressBtn.innerHTML = batchFiles.length > 1
      ? `Compress ${batchFiles.length} PDFs <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`
      : `Compress <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
  } else {
    compressBtn.disabled = !currentFile;
  }
}

/* ================= Thumbnail preview ================= */
async function renderThumb(bytes) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 88 / base.height });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
    fileThumb.src = canvas.toDataURL('image/jpeg', 0.8);
    fileThumb.hidden = false;
    fileChipIcon.style.display = 'none';
    await pdf.destroy();
  } catch {
    fileThumb.hidden = true;
    fileChipIcon.style.display = '';
  }
}

/* ================= Single-file selection ================= */
async function setFile(file) {
  if (!file) return;
  currentFile = file;
  currentBytes = null;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatSize(file.size);
  fileChip.hidden = false;
  sizeHint.hidden = file.size <= 50 * 1024 * 1024;
  compressBtn.disabled = false;
  dropzoneTitle.textContent = DROP_READY;
  fileThumb.hidden = true;
  fileChipIcon.style.display = '';

  try {
    currentBytes = await file.arrayBuffer();
    if (currentFile === file) renderThumb(currentBytes);
  } catch { /* compression will surface the error */ }
}

/* ================= Batch list ================= */
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function renderBatchList() {
  batchList.innerHTML = '';
  batchFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.innerHTML = `${FILE_ICON}<span class="fl-name"></span><span class="fl-size">${formatSize(f.size)}</span>`;
    const nameEl = li.querySelector('.fl-name');
    nameEl.textContent = f.name;
    nameEl.title = f.name;

    const rm = document.createElement('button');
    rm.className = 'fl-btn danger';
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.style.marginLeft = 'auto';
    rm.addEventListener('click', () => {
      batchFiles.splice(i, 1);
      if (batchFiles.length === 1) {
        const last = batchFiles[0];
        batchFiles = [];
        batchMode = false;
        batchList.hidden = true;
        batchNote.hidden = true;
        setFile(last);
        updateCompressBtn();
      } else if (batchFiles.length === 0) {
        clearFile();
      } else {
        renderBatchList();
      }
    });
    li.appendChild(rm);
    batchList.appendChild(li);
  });

  batchList.hidden = batchFiles.length === 0;
  batchNote.hidden = batchFiles.length < 2;
  dropzoneTitle.textContent = batchFiles.length
    ? `${batchFiles.length} PDFs ready — drop more to add`
    : DROP_IDLE;
  updateCompressBtn();
}

/* ================= Unified file intake ================= */
function addFiles(incoming) {
  const pdfs = incoming.filter(isPdf);
  if (incoming.length && !pdfs.length) {
    showError('Not a PDF', 'Please choose .pdf files.');
    return;
  }
  const total = (currentFile ? 1 : 0) + batchFiles.length + pdfs.length;
  if (total > 1) {
    if (!batchMode) {
      batchFiles = currentFile ? [currentFile] : [];
      currentFile = null;
      currentBytes = null;
      fileChip.hidden = true;
      sizeHint.hidden = true;
      batchMode = true;
    }
    batchFiles.push(...pdfs);
    renderBatchList();
  } else if (pdfs.length) {
    batchMode = false;
    batchFiles = [];
    batchList.hidden = true;
    batchNote.hidden = true;
    setFile(pdfs[0]);
  }
}

function clearFile() {
  currentFile = null;
  currentBytes = null;
  batchMode = false;
  batchFiles = [];
  fileInput.value = '';
  fileChip.hidden = true;
  fileThumb.hidden = true;
  fileChipIcon.style.display = '';
  batchList.hidden = true;
  batchList.innerHTML = '';
  batchNote.hidden = true;
  sizeHint.hidden = true;
  compressBtn.disabled = true;
  compressBtn.innerHTML = `Compress <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
  dropzoneTitle.textContent = DROP_IDLE;
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => addFiles(Array.from(fileInput.files || [])));
fileRemove.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
    dropzoneTitle.textContent = DROP_FUN;
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    dropzoneTitle.textContent = batchMode
      ? `${batchFiles.length} PDFs ready — drop more to add`
      : currentFile ? DROP_READY : DROP_IDLE;
  })
);
dropzone.addEventListener('drop', (e) => {
  addFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
});

/* Enter = compress, when file(s) are ready */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || busy || stageInput.hidden) return;
  if (compressBtn.disabled) return;
  if (!currentFile && !batchFiles.length) return;
  runCompression();
});

/* ================= Target selection ================= */
presetGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  presetGroup.querySelectorAll('.preset').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  targetKb = Number(btn.dataset.kb);
  customSize.value = '';
});
function clearPresetActive() {
  presetGroup.querySelectorAll('.preset').forEach((b) => b.classList.remove('active'));
}
customSize.addEventListener('input', clearPresetActive);
customUnit.addEventListener('change', clearPresetActive);

/* ================= Compare bars ================= */
function fillCompareBars(original, finalSize, alreadySmall) {
  cmpBefore.textContent = formatSize(original);
  cmpAfter.textContent = formatSize(finalSize);
  cmpAfterFill.style.transition = 'none';
  cmpAfterFill.style.width = alreadySmall ? '100%' : '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cmpAfterFill.style.transition = '';
      cmpAfterFill.style.width = `${Math.max(3, Math.round((finalSize / original) * 100))}%`;
    });
  });
}

/* ================= Single compress flow ================= */
async function runSingle(target) {
  procOriginal.textContent = `Original: ${formatSize(currentFile.size)}`;
  procTarget.textContent = formatSize(target);
  progressBar.style.width = '2%';
  progressText.textContent = 'Preparing…';

  if (!currentBytes) currentBytes = await currentFile.arrayBuffer();

  if (currentBytes.byteLength <= target) {
    stopTips();
    showDone(new Uint8Array(currentBytes), { alreadySmall: true, reachedTarget: true });
    return;
  }

  const result = await compressToTarget(currentBytes, target, (info) => {
    if (info.phase === 'render') {
      const pct = Math.min(96, ((info.attempt - 1) * 100 + (info.page / info.numPages) * 100) / 4);
      progressBar.style.width = `${pct.toFixed(0)}%`;
      progressText.textContent = info.attempt === 1
        ? `Processing page ${info.page} of ${info.numPages}…`
        : `Pass ${info.attempt}: page ${info.page} of ${info.numPages} — getting closer…`;
    } else if (info.phase === 'check' && info.currentBytes) {
      progressText.textContent = `Pass ${info.attempt} result: ${formatSize(info.currentBytes)}`;
    }
  });

  addProcessedBytes(currentBytes.byteLength);
  progressBar.style.width = '100%';
  stopTips();
  showDone(result.bytes, result);
}

/* ================= Batch compress flow ================= */
async function runBatch(target) {
  const total = batchFiles.length;
  const totalOriginal = batchFiles.reduce((s, f) => s + f.size, 0);
  procOriginal.textContent = `Original: ${formatSize(totalOriginal)} (${total} files)`;
  procTarget.textContent = formatSize(target);
  progressBar.style.width = '2%';
  progressText.textContent = 'Preparing…';

  const results = [];
  const failures = [];
  const usedNames = new Set();

  for (let i = 0; i < total; i++) {
    const f = batchFiles[i];
    const base = (f.name || 'document').replace(/\.pdf$/i, '');
    let outName = `${base}-slim.pdf`;
    for (let n = 2; usedNames.has(outName); n++) outName = `${base}-slim-${n}.pdf`;
    usedNames.add(outName);

    try {
      const bytes = await f.arrayBuffer();
      if (bytes.byteLength <= target) {
        results.push({ name: outName, bytes: new Uint8Array(bytes), original: bytes.byteLength, final: bytes.byteLength, note: 'already small' });
        progressBar.style.width = `${(((i + 1) / total) * 100).toFixed(0)}%`;
        continue;
      }

      const r = await compressToTarget(bytes, target, (info) => {
        let frac = 0.02;
        if (info.phase === 'render') frac = Math.min(0.96, ((info.attempt - 1) + info.page / info.numPages) / 4);
        else if (info.phase === 'check') frac = 1;
        progressBar.style.width = `${(((i + frac) / total) * 100).toFixed(0)}%`;
        progressText.textContent = info.attempt === 1
          ? `File ${i + 1} of ${total}: ${f.name}`
          : `File ${i + 1} of ${total}: pass ${info.attempt} — getting closer…`;
      });

      results.push({ name: outName, bytes: r.bytes, original: bytes.byteLength, final: r.bytes.byteLength, note: r.reachedTarget ? '' : 'best effort' });
      addProcessedBytes(bytes.byteLength);
    } catch (err) {
      console.error(err);
      failures.push({
        name: f.name,
        reason: err && err.name === 'PasswordException' ? 'password-protected' : 'could not be read',
      });
    }
  }

  stopTips();
  if (!results.length) {
    const why = failures.length ? ` — e.g. "${failures[0].name}" is ${failures[0].reason}.` : '.';
    showError('Batch failed', `None of the files could be processed${why}`);
    return;
  }

  progressText.textContent = 'Packing…';
  if (results.length > 1) {
    const zip = new JSZip();
    results.forEach((r) => zip.file(r.name, r.bytes));
    batchZip = await zip.generateAsync({ type: 'uint8array' });
    batchZipName = 'pdf-slim.zip';
  } else {
    batchZip = results[0].bytes;
    batchZipName = results[0].name;
  }
  batchResults = results;

  progressBar.style.width = '100%';
  showBatchDone(results, failures);
}

/* ================= Entry point ================= */
async function runCompression(overrideTargetBytes) {
  if (busy) return;
  if (!batchMode && !currentFile) return;
  if (batchMode && !batchFiles.length) return;
  busy = true;

  const target = overrideTargetBytes || getTargetBytes();
  batchResults = [];
  batchZip = null;
  showStage(stageProcessing);
  startTips();

  try {
    if (batchMode) {
      await runBatch(target);
    } else {
      await runSingle(target);
    }
  } catch (err) {
    stopTips();
    console.error(err);
    if (err && err.name === 'PasswordException') {
      showError('Password-protected PDF', 'This PDF is encrypted. Remove the password first, then try again.');
    } else if (err && /Invalid PDF/i.test(String(err.message || err))) {
      showError('Invalid PDF', 'This file does not look like a valid PDF.');
    } else {
      showError('Compression failed', 'Something went wrong while processing this file. A different PDF may work — very large or unusual files can hit browser memory limits.');
    }
  } finally {
    busy = false;
  }
}

/* ================= Done states ================= */
function showDone(bytes, meta) {
  const original = currentBytes ? currentBytes.byteLength : currentFile.size;
  const finalSize = bytes.byteLength;
  const savedPct = original > 0 ? Math.max(0, Math.round((1 - finalSize / original) * 100)) : 0;

  const base = (currentFile.name || 'document').replace(/\.pdf$/i, '');
  const outName = `${base}-slim.pdf`;

  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  downloadBtn.href = downloadUrl;
  downloadBtn.setAttribute('download', outName);

  resultCardSingle.hidden = false;
  batchResultList.hidden = true;
  downloadBtn.hidden = false;
  downloadZipBtn.hidden = true;

  doneTitle.textContent = meta.alreadySmall
    ? 'Already under the target — nicely done.'
    : `Done — ${formatSize(finalSize)}, down from ${formatSize(original)}.`;

  resultQuip.textContent = meta.alreadySmall
    ? QUIP_ALREADY
    : savedPct >= 50 ? pick(QUIPS_BIG) : pick(QUIPS_SMALL);

  fillCompareBars(original, finalSize, meta.alreadySmall);

  resultName.textContent = outName;
  resultName.title = outName;
  resultSize.textContent = formatSize(finalSize);
  resultSaved.textContent = savedPct > 0 ? `${savedPct}% smaller` : 'same size';

  if (meta.alreadySmall) {
    resultNote.textContent = 'No compression was needed — this is your original file, untouched.';
  } else if (!meta.reachedTarget) {
    resultNote.textContent = `Heads up: we couldn't quite reach the target — this PDF is mostly text or already optimized, so ${formatSize(finalSize)} is the smallest we could get while keeping pages readable.`;
  } else {
    resultNote.textContent = 'Pages were re-encoded as optimized images to hit your target size. All processing happened locally on your device.';
  }

  showStage(stageDone);

  if (!meta.alreadySmall && savedPct >= 50) celebrate();
}

function showBatchDone(results, failures) {
  const totalOriginal = results.reduce((s, r) => s + r.original, 0);
  const totalFinal = results.reduce((s, r) => s + r.final, 0);
  const savedPct = totalOriginal > 0 ? Math.max(0, Math.round((1 - totalFinal / totalOriginal) * 100)) : 0;

  resultCardSingle.hidden = true;
  downloadBtn.hidden = true;
  downloadZipBtn.hidden = false;
  downloadZipBtn.lastChild.textContent = results.length > 1 ? ' Download all (ZIP)' : ' Download';

  doneTitle.textContent = `Done — ${results.length} file${results.length === 1 ? '' : 's'} slimmed, ${formatSize(totalOriginal)} → ${formatSize(totalFinal)}.`;
  resultQuip.textContent = savedPct >= 50 ? pick(QUIPS_BIG) : pick(QUIPS_SMALL);
  fillCompareBars(totalOriginal, totalFinal, false);

  batchResultList.innerHTML = '';
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    const note = r.note ? `<span class="fl-note">${r.note}</span>` : '';
    li.innerHTML = `${FILE_ICON}<span class="fl-name"></span><span class="fl-size">${formatSize(r.original)} → ${formatSize(r.final)}</span>${note}`;
    const nameEl = li.querySelector('.fl-name');
    nameEl.textContent = r.name;
    nameEl.title = r.name;

    const dl = document.createElement('button');
    dl.className = 'fl-dl';
    dl.type = 'button';
    dl.title = `Download ${r.name}`;
    dl.innerHTML = DL_ICON;
    dl.addEventListener('click', () => downloadBytes(r.bytes, r.name));
    li.appendChild(dl);
    batchResultList.appendChild(li);
  });
  failures.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'file-list-item fl-fail';
    li.innerHTML = `${FILE_ICON}<span class="fl-name"></span><span class="fl-note">skipped — ${f.reason}</span>`;
    const nameEl = li.querySelector('.fl-name');
    nameEl.textContent = f.name;
    nameEl.title = f.name;
    batchResultList.appendChild(li);
  });
  batchResultList.hidden = false;

  const bestEffort = results.some((r) => r.note === 'best effort');
  resultNote.textContent = bestEffort
    ? 'Files marked "best effort" could not fully reach the target — they are mostly text or already optimized. Everything was processed locally on your device.'
    : 'Every file was processed locally on your device, one after another. Nothing was uploaded.';

  showStage(stageDone);

  if (savedPct >= 50) celebrate();
}

function showError(title, body) {
  errorTitle.textContent = title;
  errorBody.textContent = body;
  showStage(stageError);
}

compressBtn.addEventListener('click', () => runCompression());
downloadZipBtn.addEventListener('click', () => {
  if (batchZip) downloadBytes(batchZip, batchZipName, batchZipName.endsWith('.zip') ? 'application/zip' : 'application/pdf');
});
againBtn.addEventListener('click', () => { clearFile(); showStage(stageInput); });
errorRetry.addEventListener('click', () => showStage(stageInput));
resizeGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  runCompression(Number(btn.dataset.kb) * 1024);
});
