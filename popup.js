// Popup: one button that injects filler.js into the current tab and reports what was filled.

const fillBtn = document.getElementById("fill-btn");
const statusEl = document.getElementById("status");
const missingBox = document.getElementById("missing");
const missingList = document.getElementById("missing-list");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function showMissing(labels) {
  missingList.replaceChildren();
  for (const label of labels.slice(0, 10)) {
    const li = document.createElement("li");
    li.textContent = label;
    missingList.appendChild(li);
  }
  missingBox.hidden = labels.length === 0;
}

async function runIn(target) {
  await chrome.scripting.executeScript({ target, files: ["filler.js"] });
  return chrome.scripting.executeScript({
    target,
    func: () => (window.__formFillerRun ? window.__formFillerRun() : null),
  });
}

async function fillPage() {
  fillBtn.disabled = true;
  setStatus("Filling…");
  showMissing([]);
  document.getElementById("tip").hidden = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let results;
    try {
      results = await runIn({ tabId: tab.id, allFrames: true });
    } catch {
      // Some frames can be off-limits; fall back to the main page only.
      results = await runIn({ tabId: tab.id });
    }

    let filled = 0;
    const missing = [];
    const errors = [];
    for (const { result } of results) {
      if (!result) continue;
      filled += result.filled;
      missing.push(...result.missing);
      if (result.error) errors.push(result.error);
    }

    if (errors.length && !filled) setStatus(`Error: ${errors[0]}`, true);
    else if (filled === 0) setStatus("Didn't find any fields I could fill on this page.", true);
    else setStatus(`Filled ${filled} field${filled === 1 ? "" : "s"} ✓`);
    showMissing([...new Set(missing)]);
    document.getElementById("tip").hidden = errors.length > 0 && !filled;
  } catch (err) {
    const message = String((err && err.message) || err);
    if (/cannot access|cannot be scripted|chrome:\/\/|extensions gallery/i.test(message)) {
      setStatus("Chrome doesn't allow extensions on this page. Open a job application and try again.", true);
    } else {
      setStatus(`Error: ${message}`, true);
    }
  } finally {
    fillBtn.disabled = false;
  }
}

async function init() {
  const { profile } = await chrome.storage.local.get("profile");
  const hasData = !!profile && Object.values(profile).some((v) => v);
  document.getElementById("ready").hidden = !hasData;
  document.getElementById("empty").hidden = hasData;
}

fillBtn.addEventListener("click", fillPage);
document.getElementById("options-link").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
init();
