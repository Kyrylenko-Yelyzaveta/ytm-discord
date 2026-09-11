// Isolated world: has chrome.* access, cannot read mediaSession.
// Carries settings across to inject.js in the MAIN world.

const TAG = "[ytm-relay]";
let lastSent = "";
let pollTimer = null;

// After an extension reload the old context is dead. Touching chrome.*
// from here throws, and Chrome files it as an extension error, so we
// check first and stop quietly instead.
function alive() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function stop(reason) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  console.log(TAG, "stopped:", reason, "- reload the tab");
}

console.log(TAG, "loaded");

function tell(cfg, why) {
  const sig = JSON.stringify(cfg);
  if (sig === lastSent) return;
  lastSent = sig;
  console.log(TAG, "->", cfg.enabled, cfg.clientId ? "(id set)" : "(no id)", why);
  window.postMessage(
    { source: "ytm-bridge-relay", type: "config", ...cfg },
    "*"
  );
}

function read(cb) {
  if (!alive()) {
    stop("context invalidated");
    return;
  }
  try {
    chrome.storage.local.get({ enabled: true, clientId: "" }, (res) => {
      if (chrome.runtime.lastError) return;
      cb({ enabled: !!res.enabled, clientId: String(res.clientId || "") });
    });
  } catch (e) {
    stop("storage unavailable");
  }
}

// inject.js announces itself on load; answer with the current settings.
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (d && d.source === "ytm-bridge-main" && d.type === "ready") {
    lastSent = "";
    read((cfg) => tell(cfg, "ready"));
  }
});

if (alive()) {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (changes.enabled || changes.clientId)) {
        read((cfg) => tell(cfg, "event"));
      }
    });
  } catch (e) {
    // no listener, the poll below covers it
  }
}

// Polling fallback - one cheap read per second, always works.
pollTimer = setInterval(() => read((cfg) => tell(cfg, "poll")), 1000);

read((cfg) => tell(cfg, "init"));
