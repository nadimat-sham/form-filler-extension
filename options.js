// Options page: lets the user enter, save, and reload their profile information.
// Storage layout (chrome.storage.local):
//   profile:         { firstName, lastName, email, workAuthorized, ... }  (keyed by input "name")
//   savedAnswers:    [{ question, answer }]
//   resume:          { name, type, data }  (data = base64 data URL)
//   coverLetterFile: { name, type, data }

const FILE_KEYS = ["resume", "coverLetterFile"];

const form = document.getElementById("profile-form");
const answersList = document.getElementById("answers-list");
const answerTemplate = document.getElementById("answer-row-template");
const saveStatus = document.getElementById("save-status");

// Files chosen or removed since the last save.
// undefined = unchanged, null = remove on save, object = store on save.
const pendingFiles = {};
// Files as currently stored, for display.
const storedFiles = {};

// ---------- Profile fields ----------

function profileFields() {
  // Every named input/select/textarea in the form is a profile field.
  return Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"));
}

// Checkboxes are stored as "Yes" / "".
function readProfile() {
  const profile = {};
  for (const field of profileFields()) {
    profile[field.name] = field.type === "checkbox" ? (field.checked ? "Yes" : "") : field.value.trim();
  }
  return profile;
}

function fillProfile(profile) {
  for (const field of profileFields()) {
    if (profile[field.name] === undefined) continue;
    if (field.type === "checkbox") {
      field.checked = profile[field.name] === "Yes";
      continue;
    }
    // Answers saved from a website's dropdown may not be in our list; add them so they aren't lost.
    const value = profile[field.name];
    if (field.tagName === "SELECT" && value && ![...field.options].some((o) => o.value === value)) {
      field.add(new Option(value, value));
    }
    field.value = value;
  }
  updatePermanentFields();
}

// Grey out the permanent address when it's the same as the present one.
const permanentSame = document.getElementById("permanent-same");
const permanentFields = document.getElementById("permanent-fields");
function updatePermanentFields() {
  permanentFields.classList.toggle("disabled", permanentSame.checked);
  permanentFields.querySelectorAll("input").forEach((input) => (input.disabled = permanentSame.checked));
}
permanentSame.addEventListener("change", updatePermanentFields);

// ---------- Saved answers ----------

function addAnswerRow(question = "", answer = "") {
  const row = answerTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".answer-question").value = question;
  row.querySelector(".answer-text").value = answer;
  row.querySelector(".answer-remove").addEventListener("click", () => row.remove());
  answersList.appendChild(row);
  return row;
}

function readAnswers() {
  return Array.from(answersList.querySelectorAll(".answer-row"))
    .map((row) => ({
      question: row.querySelector(".answer-question").value.trim(),
      answer: row.querySelector(".answer-text").value.trim(),
    }))
    .filter((item) => item.question || item.answer);
}

// ---------- Files ----------

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderFile(key) {
  const container = form.querySelector(`[data-file-key="${key}"]`);
  const nameEl = container.querySelector(".file-name");
  const removeBtn = container.querySelector(".file-remove");

  const pending = pendingFiles[key];
  const file = pending === undefined ? storedFiles[key] : pending;

  if (file) {
    nameEl.textContent = pending ? `${file.name} (not saved yet)` : file.name;
    removeBtn.hidden = false;
  } else {
    nameEl.textContent = pending === null ? "Will be removed when you save" : "No file saved";
    removeBtn.hidden = true;
  }
}

function setupFileField(key) {
  const container = form.querySelector(`[data-file-key="${key}"]`);
  const input = container.querySelector('input[type="file"]');
  const removeBtn = container.querySelector(".file-remove");

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await readFileAsDataURL(file);
      pendingFiles[key] = { name: file.name, type: file.type, data };
    } catch (err) {
      showStatus(`Could not read file: ${err.message}`, true);
    }
    input.value = "";
    renderFile(key);
  });

  removeBtn.addEventListener("click", () => {
    // After saving there should be no file: delete the stored one if any, discard any unsaved pick.
    pendingFiles[key] = storedFiles[key] ? null : undefined;
    renderFile(key);
  });
}

// ---------- Load / save ----------

let statusTimer;
function showStatus(message, isError = false) {
  clearTimeout(statusTimer);
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", isError);
  if (!isError) {
    statusTimer = setTimeout(() => (saveStatus.textContent = ""), 2500);
  }
}

async function load() {
  const data = await chrome.storage.local.get(["profile", "savedAnswers", ...FILE_KEYS]);

  fillProfile(data.profile || {});

  answersList.replaceChildren();
  for (const item of data.savedAnswers || []) {
    addAnswerRow(item.question, item.answer);
  }

  for (const key of FILE_KEYS) {
    storedFiles[key] = data[key] || undefined;
    pendingFiles[key] = undefined;
    renderFile(key);
  }
}

async function save(event) {
  event.preventDefault();

  // Keep values saved from websites that this page has no field for (e.g. nidNumberHas).
  const { profile: stored } = await chrome.storage.local.get("profile");
  const toSet = {
    profile: { ...(stored || {}), ...readProfile() },
    savedAnswers: readAnswers(),
  };
  const toRemove = [];

  for (const key of FILE_KEYS) {
    if (pendingFiles[key] === null) toRemove.push(key);
    else if (pendingFiles[key]) toSet[key] = pendingFiles[key];
  }

  try {
    await chrome.storage.local.set(toSet);
    if (toRemove.length) await chrome.storage.local.remove(toRemove);

    for (const key of FILE_KEYS) {
      if (pendingFiles[key] === null) storedFiles[key] = undefined;
      else if (pendingFiles[key]) storedFiles[key] = pendingFiles[key];
      pendingFiles[key] = undefined;
      renderFile(key);
    }

    // Drop empty answer rows so the list matches what was stored.
    answersList.replaceChildren();
    for (const item of toSet.savedAnswers) addAnswerRow(item.question, item.answer);

    showStatus("Saved ✓");
  } catch (err) {
    showStatus(`Save failed: ${err.message}`, true);
  }
}

// ---------- Init ----------

document.getElementById("add-answer").addEventListener("click", () => {
  addAnswerRow().querySelector(".answer-question").focus();
});
form.addEventListener("submit", save);
FILE_KEYS.forEach(setupFileField);
load().catch((err) => showStatus(`Could not load saved data: ${err.message}`, true));
