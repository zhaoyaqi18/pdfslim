// PDF Slim — "Send to phone" sender component
// Usage: sendToPhone({ name: 'file.pdf', getFile: async () => blob })
// Shows a QR modal, connects via WebRTC, transfers the file peer-to-peer.

const SIGNAL_URL = 'wss://pdfslim-signal.2782255188.workers.dev/room';
const QRJS_URL = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
const CHUNK_SIZE = 64 * 1024;

export async function sendToPhone({ name, getFile }) {
  if (typeof RTCPeerConnection === 'undefined') {
    alert('WebRTC is not supported in this browser.');
    return;
  }

  const roomId = makeRoomId();
  const qrContent = `${location.origin}/receive/?room=${roomId}`;

  // ---------- Modal UI ----------
  const modal = document.createElement('div');
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);position:relative">
      <button id="sp-close" style="position:absolute;top:10px;right:12px;border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer" aria-label="Close">×</button>
      <div style="font-size:16px;font-weight:700;color:#0f172a">Send to phone</div>
      <p style="font-size:12.5px;color:#64748b;margin:6px 0 14px">Scan with your phone camera to receive <b style="color:#0f172a">${escapeHtml(name)}</b></p>
      <div id="sp-qr" style="display:flex;justify-content:center;margin:0 auto 8px;min-height:170px;align-items:center"></div>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:6px">Room code: <b style="color:#0f172a;letter-spacing:1px">${roomId}</b> · <a href="${qrContent}" style="color:#0ea5e9">open on phone</a></p>
      <div id="sp-status" style="font-size:13px;color:#0ea5e9;font-weight:600;min-height:20px">Waiting for your phone…</div>
      <div id="sp-progress" style="display:none;margin-top:10px">
        <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden">
          <div id="sp-bar" style="height:100%;width:0%;background:#0ea5e9;border-radius:999px;transition:width .15s"></div>
        </div>
        <p id="sp-pct" style="font-size:12px;color:#64748b;margin-top:6px"></p>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin-top:14px">Peer-to-peer · Your file doesn't pass through any server</p>
    </div>`;
  document.body.appendChild(modal);
  const closeBtn = modal.querySelector('#sp-close');
  closeBtn.onclick = () => { cleanup(); };
  modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });

  const statusEl = modal.querySelector('#sp-status');
  const setStatus = (text, color) => {
    statusEl.textContent = text;
    statusEl.style.color = color || '#0ea5e9';
  };

  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    try { ws && ws.close(); } catch (e) {}
    try { pc && pc.close(); } catch (e) {}
    try { channel && channel.close(); } catch (e) {}
    modal.remove();
  }

  // ---------- QR code ----------
  const qrBox = modal.querySelector('#sp-qr');
  try {
    await loadScript(QRJS_URL);
    const qr = new QRCode(qrBox, {
      text: qrContent,
      width: 164,
      height: 164,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
    });
    void qr;
  } catch (e) {
    qrBox.innerHTML = '<a href="' + qrContent + '" style="font-size:13px;color:#0ea5e9;word-break:break-all">Open link on your phone</a>';
  }

  // ---------- WebRTC sender ----------
  let ws = null;
  let pc = null;
  let channel = null;

  try {
    ws = new WebSocket(`${SIGNAL_URL}?room=${roomId}&role=sender`);
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    });

    channel = pc.createDataChannel('file');
    channel.binaryType = 'arraybuffer';

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      try {
        if (msg.type === 'peer-ready') {
          setStatus('Phone connected! Sending…');
          if (!pc.localDescription) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
          }
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription(msg.sdp);
        } else if (msg.type === 'ice') {
          if (msg.candidate) await pc.addIceCandidate(msg.candidate);
        } else if (msg.type === 'peer-gone') {
          setStatus('Phone disconnected. Scan again.', '#dc2626');
        }
      } catch (err) {
        console.error('signaling error', err);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
      }
    };

    ws.onerror = () => setStatus('Connection error. Try again.', '#dc2626');
    ws.onclose = () => {
      if (!closed && (!channel || channel.readyState !== 'open')) {
        setStatus('Connection closed.', '#dc2626');
      }
    };

    channel.onopen = async () => {
      setStatus('Sending…');
      modal.querySelector('#sp-progress').style.display = '';
      try {
        const blob = await getFile();
        const buf = await blob.arrayBuffer();
        channel.send(JSON.stringify({ type: 'meta', name, size: buf.byteLength }));
        const total = buf.byteLength;
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          channel.send(buf.slice(i, Math.min(i + CHUNK_SIZE, total)));
          const pct = Math.round((i / total) * 100);
          modal.querySelector('#sp-bar').style.width = pct + '%';
          modal.querySelector('#sp-pct').textContent = pct + '%';
        }
        modal.querySelector('#sp-bar').style.width = '100%';
        modal.querySelector('#sp-pct').textContent = '100%';
        setStatus('✓ Sent!', '#16a34a');
        setTimeout(cleanup, 1500);
      } catch (err) {
        setStatus('Send failed: ' + err.message, '#dc2626');
      }
    };

    channel.onerror = () => setStatus('Transfer error.', '#dc2626');
    channel.onclose = () => {
      if (!closed && !(channel && channel.readyState === 'open')) {
        setStatus('Transfer ended.', '#dc2626');
      }
    };
  } catch (err) {
    setStatus('Failed: ' + err.message, '#dc2626');
  }
}

/* ---------- helpers ---------- */

function makeRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });
}
