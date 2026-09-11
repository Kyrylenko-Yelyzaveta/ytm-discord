const toggle = document.getElementById("toggle");
const label = document.getElementById("label");
const input = document.getElementById("clientId");
const save = document.getElementById("save");
const hint = document.getElementById("hint");

const defaultHint = hint.innerHTML;

function paint(enabled, hasId) {
  toggle.checked = enabled;
  if (!hasId) {
    label.textContent = "Нужен ID";
  } else {
    label.textContent = enabled ? "Трансляция идёт" : "Выключено";
  }
}

chrome.storage.local.get({ enabled: true, clientId: "" }, (res) => {
  input.value = res.clientId || "";
  paint(!!res.enabled, !!res.clientId);
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled });
  paint(enabled, !!input.value.trim());
});

save.addEventListener("click", () => {
  // Application IDs are numeric snowflakes, so strip anything else.
  const clientId = input.value.replace(/\D/g, "");
  input.value = clientId;
  chrome.storage.local.set({ clientId }, () => {
    hint.innerHTML = clientId
      ? '<span id="saved">Сохранено. Обнови вкладку YouTube Music.</span>'
      : defaultHint;
    paint(toggle.checked, !!clientId);
    setTimeout(() => { hint.innerHTML = defaultHint; }, 4000);
  });
});
