/**
 * Shared helpers for all PDF Slim tool pages.
 */

/* ================= Theme ================= */
export function initTheme() {
  const rootEl = document.documentElement;
  const apply = (theme) => {
    rootEl.setAttribute('data-theme', theme);
    try { localStorage.setItem('pdfslim-theme', theme); } catch { /* ignore */ }
  };
  let saved = null;
  try { saved = localStorage.getItem('pdfslim-theme'); } catch { /* ignore */ }
  apply(saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      apply(rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }
}

/* ================= Formatting ================= */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ================= Download ================= */
export function downloadBytes(bytes, name, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ================= Dropzone wiring ================= */
export function wireDrop({ zone, input, onFiles }) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files || []));
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('dragover'); })
  );
  zone.addEventListener('drop', (e) => {
    onFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
  });
}

/* ================= Stage helpers ================= */
export function stageSwitcher(stages) {
  return (name) => {
    for (const [key, el] of Object.entries(stages)) el.hidden = key !== name;
  };
}

export function setProgress(barEl, textEl, pct, text) {
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
  if (textEl && text) textEl.textContent = text;
}

export function isPdfFile(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

export function slimName(originalName, suffix = '-slim', ext = '.pdf') {
  return `${(originalName || 'document').replace(/\.[^.]+$/, '')}${suffix}${ext}`;
}

/* ================= Local stats ("0 bytes uploaded") ================= */
const STATS_KEY = 'pdfslim-local-bytes';

export function addProcessedBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return;
  let total = 0;
  try { total = Number(localStorage.getItem(STATS_KEY)) || 0; } catch { /* ignore */ }
  total += n;
  try { localStorage.setItem(STATS_KEY, String(total)); } catch { /* ignore */ }
  renderStats();
}

export function renderStats() {
  let total = 0;
  try { total = Number(localStorage.getItem(STATS_KEY)) || 0; } catch { /* ignore */ }
  const html = `<strong>${formatSize(total)}</strong> processed locally &middot; <strong>0 bytes</strong> uploaded`;
  for (const id of ['local-stats', 'local-stats-hero']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}

/* ================= Confetti (pure CSS/JS, brand palette) ================= */
const CONFETTI_COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E'];

export function celebrate() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const pieces = 46;
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 5 + Math.random() * 6;
    el.style.left = `${Math.random() * 100}vw`;
    el.style.width = `${size}px`;
    el.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDelay = `${Math.random() * 0.45}s`;
    el.style.animationDuration = `${1.7 + Math.random() * 1.1}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}

/* ================= Offline toast ================= */
let offlineToast = null;
let offlineTimer = null;

function ensureOfflineToast() {
  if (offlineToast) return offlineToast;
  offlineToast = document.createElement('div');
  offlineToast.className = 'offline-toast';
  offlineToast.setAttribute('role', 'status');
  offlineToast.innerHTML = '<strong>You&rsquo;re offline</strong> &mdash; everything still works.';
  document.body.appendChild(offlineToast);
  return offlineToast;
}

function initOfflineToast() {
  window.addEventListener('offline', () => {
    const toast = ensureOfflineToast();
    toast.classList.add('show');
    if (offlineTimer) clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => toast.classList.remove('show'), 4500);
  });
  window.addEventListener('online', () => {
    if (offlineToast) offlineToast.classList.remove('show');
  });
}

/* ================= One-call delight wiring for every page ================= */
export function initDelight() {
  renderStats();
  initOfflineToast();
}
