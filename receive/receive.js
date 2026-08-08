// PDF Slim — mobile receive page (WebRTC receiver)
// Scanned QR → this page with ?room=XXXXXX → peer-to-peer receive

const SIGNAL_URL = 'wss://signal.pdfslim.app/room';
const CHUNK_SIZE = 64 * 1024;

const $ = (id) => document.getElementById(id);
const roomId = new URLSearchParams(location.search).get('room');

function setIcon(state) {
  const icon = $('icon');
  icon.className = 'icon' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
}
function setTitle(t) { $('title').textContent = t; }
function setStatus(s) { $('status').textContent = s; }
function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }

async function main() {
  if (!roomId) {
    setIcon('err');
    setTitle('Invalid link');
    setStatus('This link is missing the room code. Please scan the QR code again.');
    hide('spinner');
    show('errWrap');
    return;
  }

  const ws = new WebSocket(`${SIGNAL_URL}?room=${roomId}&role=receiver`);
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  });

  let dataChannel = null;
  let pendingMeta = null; // { name, size }
  let receivedChunks = [];
  let receivedBytes = 0;
  let received = false; // 传输完成标记，防止断连通知覆盖完成状态

  // ---- DataChannel: receive file ----
  pc.ondatachannel = (e) => {
    dataChannel = e.channel;
    dataChannel.binaryType = 'arraybuffer';
    setTitle('Connected');
    setStatus('Receiving file from your computer…');
    hide('spinner');
    show('progressWrap');

    dataChannel.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        // Meta message: { type:'meta', name, size }
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'meta') {
            pendingMeta = { name: m.name, size: m.size };
            receivedChunks = [];
            receivedBytes = 0;
            $('fileName').textContent = m.name;
            updateProgress(0);
          }
        } catch (e) { /* ignore */ }
      } else {
        // Binary chunk
        if (!pendingMeta) return;
        receivedChunks.push(ev.data);
        receivedBytes += ev.data.byteLength;
        updateProgress(receivedBytes / pendingMeta.size);
      }
    };

    dataChannel.onclose = () => {
      if (pendingMeta && receivedBytes >= pendingMeta.size) {
        finish();
      }
    };
  };

  // ---- Signaling ----
  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    try {
      if (msg.type === 'offer') {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
      } else if (msg.type === 'ice') {
        if (msg.candidate) await pc.addIceCandidate(msg.candidate);
      } else if (msg.type === 'peer-gone') {
        if (received) return; // 已收到文件，忽略断连
        if (!dataChannel || dataChannel.readyState !== 'open') {
          setIcon('err');
          setTitle('Connection lost');
          setStatus('Your computer closed the connection. Scan the QR code again.');
          hide('spinner');
          show('errWrap');
        }
      }
    } catch (err) {
      console.error('signaling error', err);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
    }
  };

  ws.onerror = () => {
    setIcon('err');
    setTitle('Connection error');
    setStatus('Could not reach the signaling server. Check your internet and try again.');
    hide('spinner');
    show('errWrap');
  };

  ws.onclose = () => {
    if (received) return; // 已收到文件，忽略断连
    if (!dataChannel || dataChannel.readyState !== 'open') {
      setIcon('err');
      setTitle('Connection lost');
      setStatus('Connection closed. Scan the QR code again to retry.');
      hide('spinner');
      show('errWrap');
    }
  };

  // ---- UI helpers ----
  function updateProgress(ratio) {
    const pct = Math.min(100, Math.round(ratio * 100));
    $('progressBar').style.width = pct + '%';
    $('progressText').textContent = pct + '%';
    if (pct >= 100) {
      setTitle('Transfer complete');
      setStatus('Saving…');
    }
  }

  function finish() {
    received = true;
    const blob = new Blob(receivedChunks, { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const btn = $('downloadBtn');
    btn.href = url;
    btn.download = pendingMeta.name || 'received.pdf';
    hide('progressWrap');
    show('doneWrap');
    setIcon('ok');
    setTitle('File received!');
    setStatus('');
    $('doneHint').textContent = pendingMeta.name + ' · ' + formatSize(receivedBytes);
  }

  function formatSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }
}

main();
