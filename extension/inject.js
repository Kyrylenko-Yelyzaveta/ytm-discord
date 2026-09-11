// Runs in the MAIN world so navigator.mediaSession.metadata is readable.
// Cannot use chrome.* from here - relay.js handles that and talks to us
// over window.postMessage.

const BRIDGE_URL = "ws://127.0.0.1:8765";
const RECONNECT_MS = 3000;
const HEARTBEAT_MS = 5000;
const POLL_MS = 2000;

let ws = null;
let enabled = null;          // null = not told yet, do nothing
let clientId = "";
let lastSignature = "";
let reconnectTimer = null;

/* ---------- control channel with relay.js ---------- */

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.source !== "ytm-bridge-relay" || d.type !== "config") return;

  const nextEnabled = !!d.enabled;
  const nextId = String(d.clientId || "");
  const idChanged = nextId !== clientId;
  const stateChanged = nextEnabled !== enabled;
  if (!idChanged && !stateChanged) return;

  clientId = nextId;
  enabled = nextEnabled;
  console.log("[ytm-bridge] enabled =", enabled, clientId ? "(id set)" : "(no id)");

  if (!enabled) {
    shutdown();
  } else if (idChanged && ws) {
    // reconnect so the bridge picks up the new application id
    shutdown();
    connect();
  } else {
    connect();
  }
});

// Ask relay.js for the current settings (it may load after us).
function announce() {
  window.postMessage({ source: "ytm-bridge-main", type: "ready" }, "*");
}
announce();
setTimeout(announce, 500);
setTimeout(announce, 2000);

/* ---------- transport ---------- */

function connect() {
  if (!enabled || (ws && ws.readyState <= WebSocket.OPEN)) return;
  clearTimeout(reconnectTimer);
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch (e) {
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
    return;
  }
  ws.onopen = () => {
    console.log("[ytm-bridge] connected to bridge");
    // The bridge needs the application id before it can reach Discord.
    ws.send(JSON.stringify({ type: "hello", clientId }));
    lastSignature = "";
    push(true);
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "rpc" && !m.ok) {
        console.warn("[ytm-bridge] bridge could not reach Discord - check the Application ID");
      }
    } catch (e) {}
  };
  ws.onclose = () => {
    if (enabled) reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}

// Tell the bridge to drop the presence right now, then hang up.
function shutdown() {
  clearTimeout(reconnectTimer);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: "off" })); } catch (e) {}
  }
  try { if (ws) ws.close(); } catch (e) {}
  ws = null;
  lastSignature = "";
}

function send(payload) {
  if (enabled && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/* ---------- reading the player ---------- */

function getVideo() {
  const vids = Array.from(document.querySelectorAll("video"));
  return vids.find(v => !v.paused) || vids[0] || null;
}

function biggestArtwork(list) {
  if (!list || !list.length) return null;
  const sorted = [...list].sort((a, b) => {
    const sa = parseInt((a.sizes || "0x0").split("x")[0], 10) || 0;
    const sb = parseInt((b.sizes || "0x0").split("x")[0], 10) || 0;
    return sb - sa;
  });
  return sorted[0].src || null;
}

function readState() {
  const md = navigator.mediaSession && navigator.mediaSession.metadata;
  const video = getVideo();
  if (!md || !video) return null;
  return {
    type: "state",
    title: md.title || "",
    artist: md.artist || "",
    album: md.album || "",
    artwork: biggestArtwork(md.artwork),
    position: Math.floor(video.currentTime || 0),
    duration: Math.floor(video.duration || 0),
    paused: !!video.paused,
    videoId: new URLSearchParams(location.search).get("v") || null,
    ts: Date.now()
  };
}

function push(force = false) {
  if (!enabled) return;
  const s = readState();
  if (!s) return;
  const sig = [s.title, s.artist, s.paused, Math.floor(s.position / 3)].join("|");
  if (!force && sig === lastSignature) return;
  lastSignature = sig;
  send(s);
}

function attachVideoEvents() {
  const video = getVideo();
  if (!video || video.dataset.ytmBridge) return;
  video.dataset.ytmBridge = "1";
  ["play", "pause", "seeked", "ended", "loadedmetadata"].forEach(ev =>
    video.addEventListener(ev, () => push(true))
  );
}

setInterval(() => { attachVideoEvents(); push(); }, POLL_MS);
setInterval(() => send({ type: "heartbeat", ts: Date.now() }), HEARTBEAT_MS);
