// Injected into the current page (every frame) by popup.js. Defines window.__formFillerRun(),
// which reads the saved data from chrome.storage.local, fills the fields it recognizes and
// returns { filled, missing, error? } to the popup.
(() => {
  const PLACEHOLDER = /^(select|choose|please (select|choose)|pick|none selected|start typing)\b/;
  const DECLINE = /decline|prefer not|rather not|choose not|not (wish|want) to|don t (wish|want)|do not (wish|want)|not to (answer|say|disclose|identify)/;
  const TEXT_TYPES = new Set(["text", "email", "tel", "url", "number", "date"]);

  // Only values the user entered are ever filled: no guessing, no borrowing from similar fields.
  const DATE_KEYS = new Set(["startDate", "dateOfBirth"]);

  function get(p, key) {
    return p[key] || "";
  }

  // Dropdowns, radio buttons, checkboxes and custom comboboxes get a choice; inputs get text.
  function isChoiceField(el) {
    return el.tagName === "SELECT" || el.type === "radio" || el.type === "checkbox" || el.getAttribute("role") === "combobox" || el.tagName === "BUTTON";
  }

  // "Do you have one?" dropdown when the field is a choice, the number itself when it's a text box.
  // "Do you have one?" dropdown: only the Yes/No the user chose themselves (saved as e.g.
  // nidNumberHas). In a text box: the number itself.
  const idNumber = (key) => (p, el) => (isChoiceField(el) ? p[`${key}Has`] || "" : p[key]);
  const idNumberStore = (key) => (el) => (isChoiceField(el) ? `${key}Has` : key);

  // Same-named fields in different form sections (e.g. "Board" under SSC and HSC) are told apart
  // by the section: the field's <fieldset> legend plus its name/id.
  const LEVELS = [
    { prefix: "mas", section: /master|post ?graduat/ },
    { prefix: "gra", section: /graduat|bachelor|honou?rs|undergrad/ },
    { prefix: "hsc", section: /\bhsc\b|higher secondary|\balim\b|a level/ },
    { prefix: "ssc", section: /\bssc\b|secondary school|\bdakhil\b|o level/ },
  ];
  const EDUCATION_RULES = LEVELS.flatMap(({ prefix, section }) => [
    { key: `${prefix}Applicable`, kind: "choice", section, test: /if applicable/, value: () => "", store: false },
    { key: `${prefix}Exam`, kind: "text", section, test: /exam|degree title|level of education/ },
    { key: `${prefix}Board`, kind: "text", section, test: /\bboard\b/ },
    { key: `${prefix}Roll`, kind: "text", section, test: /\broll\b/ },
    { key: `${prefix}Institute`, kind: "text", section, test: /universit|institut|college|school/ },
    { key: prefix === "ssc" || prefix === "hsc" ? `${prefix}Group` : `${prefix}Subject`, kind: "text", section, test: /group|subject|major|department|discipline/ },
    { key: `${prefix}Result`, kind: "text", section, test: /result|gpa|grade|division|class/, value: (p, el) => (isChoiceField(el) ? p[`${prefix}ResultType`] : get(p, `${prefix}Result`)),
      store: (el) => (isChoiceField(el) ? `${prefix}ResultType` : `${prefix}Result`) },
    { key: `${prefix}Year`, kind: "text", section, test: /year/ },
    { key: `${prefix}Duration`, kind: "text", section, test: /duration/ },
  ]);

  const ADDRESS_FIELDS = [
    ["CareOf", /care of|\bc o\b/],
    ["Village", /village|road|house|flat|street|address line/],
    ["District", /district|\bzilla?\b/],
    ["Upazila", /upazila|upozila|thana|police station|\bp s\b/],
    ["PostOffice", /post office/],
    ["PostCode", /post ?code|postal|\bzip\b/],
  ];
  const addressValue = (prefix, name) => (p) =>
    get(p, (prefix === "permanent" && p.permanentSame === "Yes" ? "present" : prefix) + name);
  const ADDRESS_RULES = [
    ...ADDRESS_FIELDS.map(([name, test]) => ({ key: `permanent${name}`, kind: "text", section: /permanent/, test, value: addressValue("permanent", name) })),
    ...ADDRESS_FIELDS.map(([name, test]) => ({ key: `present${name}`, kind: "text", section: /present|mailing|current|correspondence/, test, value: addressValue("present", name) })),
    // Forms with a single address: use the present address.
    ...ADDRESS_FIELDS.filter(([name]) => name !== "Village" && name !== "PostCode")
      .map(([name, test]) => ({ key: `present${name}`, kind: "text", test, value: addressValue("present", name) })),
    { key: "presentVillage", kind: "text", test: /village/, value: addressValue("present", "Village") },
  ];

  // Each rule maps a question to a profile key. Rules are checked in order and the first match
  // wins, so more specific questions come first. "choice" rules (Yes/No, dropdown-style questions)
  // may match long question text; "text" rules only match short labels. Rules with a `section`
  // only apply inside a matching form section.
  const RULES = [
    { key: "permanentSame", kind: "choice", test: /same as (present|current|mailing)/, store: false },
    ...EDUCATION_RULES,
    ...ADDRESS_RULES,
    { key: "needSponsorship", kind: "choice", test: /sponsor/, not: /without (\w+ ){0,3}sponsor/ },
    { key: "workAuthorized", kind: "choice", test: /authori[sz]ed to work|legally (authori[sz]ed|eligible|permitted|able) to work|eligible to work|right to work|work authori[sz]ation|work permit|without (\w+ ){0,3}sponsor/ },
    { key: "over18", kind: "choice", test: /(18|eighteen) (years|yrs)|over (the age of )?18|at least 18|age of 18|legal (working )?age/ },
    { key: "willingToRelocate", kind: "choice", test: /relocat/ },
    { key: "veteran", kind: "choice", test: /veteran/ },
    { key: "disability", kind: "choice", test: /disabilit/ },
    { key: "race", kind: "choice", test: /\brace\b|ethnic/ },
    { key: "hispanicLatino", kind: "choice", test: /hispanic|latin[oax]/ },
    { key: "gender", kind: "choice", test: /\bgender\b|\bsex\b/, not: /transgender|orientation/ },
    { key: "howHeard", kind: "choice", test: /hear about|how did you (find|learn|discover|come across)|where did you (see|find|hear)|referral source|\bsource\b/, not: /open source/ },
    { key: "quota", kind: "choice", test: /\bquota\b/ },
    { key: "departmentalStatus", kind: "choice", test: /departmental/ },
    { key: "religion", kind: "choice", test: /religion/ },
    { key: "maritalStatus", kind: "choice", test: /marital/ },
    { key: "nationality", kind: "choice", test: /nationality|citizenship/ },
    { key: "dateOfBirth", kind: "text", test: /date of birth|birth ?date|\bdob\b|birthday|জন্ম তারিখ/ },
    { key: "birthRegNumber", kind: "text", test: /birth reg/, value: idNumber("birthRegNumber"), store: idNumberStore("birthRegNumber") },
    { key: "nidNumber", kind: "text", test: /national id|\bnid\b|জাতীয় পরিচয়/, value: idNumber("nidNumber"), store: idNumberStore("nidNumber") },
    { key: "passportNumber", kind: "text", test: /passport/, value: idNumber("passportNumber"), store: idNumberStore("passportNumber") },
    { key: "fatherNameBangla", kind: "text", test: /পিতা|father.*\b(bangla|bengali|bn)\b/ },
    { key: "fatherName", kind: "text", test: /father/ },
    { key: "motherNameBangla", kind: "text", test: /মাতা|mother.*\b(bangla|bengali|bn)\b/ },
    { key: "motherName", kind: "text", test: /mother/ },
    { key: "spouseName", kind: "text", test: /spouse|husband|wife/ },
    { key: "nameBangla", kind: "text", test: /নাম|name.*\b(bangla|bengali|bn)\b|bangla name/ },
    { key: "pronouns", kind: "text", test: /pronoun/ },
    { key: "coverLetter", kind: "choice", textareaOnly: true, test: /cover letter/ },
    { key: "linkedin", kind: "text", test: /linked ?in/ },
    { key: "github", kind: "text", test: /git ?hub/ },
    { key: "website", kind: "text", test: /portfolio|website|web site|personal site|\bblog\b|\burl\b/ },
    { key: "email", kind: "text", test: /\be ?mail\b/ },
    { key: "preferredName", kind: "text", test: /preferred (first )?name|nick ?name|go by/ },
    { key: "firstName", kind: "text", test: /\bfirst name\b|\bgiven name\b|\bforename\b|\bfname\b/ },
    { key: "lastName", kind: "text", test: /\blast name\b|\bfamily name\b|\bsurname\b|\blname\b/ },
    { key: "fullName", kind: "text", test: /full name|legal name|your name|^name$|candidate name|applicant name/, value: (p) => p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" "), store: "fullName" },
    { key: "country", kind: "text", test: /\bcountry\b/, not: /code/ },
    { key: "phone", kind: "text", test: /phone|mobile|\bcell\b|telephone|contact number/ },
    { key: "zip", kind: "text", test: /\bzip\b|postal|post ?code/ },
    { key: "state", kind: "text", test: /\bstate\b|province|\bregion\b/, not: /united states|statement/ },
    { key: "city", kind: "text", test: /\bcity\b|\btown\b/ },
    { key: "location", kind: "text", test: /\blocation\b|where are you (based|located)|current residence/, store: "location" },
    { key: "street", kind: "text", test: /street|address line 1|\baddress 1\b|\baddress\b/, not: /e ?mail|ip address|line 2|address 2|web/ },
    { key: "graduationYear", kind: "text", test: /graduat|grad year|completion (year|date)|year of completion/ },
    { key: "gpa", kind: "text", test: /\bc?gpa\b|grade point/ },
    { key: "major", kind: "text", test: /\bmajor\b|field of study|discipline|concentration|area of study/ },
    { key: "degree", kind: "text", test: /\bdegree\b/ },
    { key: "school", kind: "text", test: /school|university|college|institution/ },
    { key: "yearsExperience", kind: "text", test: /years (of )?(\w+ )?experience|how many years|experience in years|total experience/ },
    { key: "expectedSalary", kind: "text", test: /salary|compensation|desired pay|pay (expectation|range)|expected (pay|ctc)|\bctc\b/ },
    { key: "startDate", kind: "text", test: /start date|available to start|when can you start|earliest start|date available|availability date|joining date/ },
    { key: "noticePeriod", kind: "text", test: /notice/ },
    { key: "currentCompany", kind: "text", test: /(current|present|most recent|latest) (company|employer|organi[sz]ation)|^(company|employer)( name)?$/ },
    { key: "currentTitle", kind: "text", test: /(current|present|most recent|latest) (job )?(title|position|role|designation)|^(job )?title$/ },
  ];

  // Standard HTML autocomplete hints → profile keys.
  const AUTOCOMPLETE = {
    "given-name": "firstName", "family-name": "lastName", name: "fullName", nickname: "preferredName",
    email: "email", tel: "phone", "tel-national": "phone", "street-address": "street", "address-line1": "street",
    "address-level2": "city", "address-level1": "state", "postal-code": "zip", country: "country",
    "country-name": "country", organization: "currentCompany", "organization-title": "currentTitle", url: "website",
  };

  const STOP_WORDS = new Set("a an the you your to do of for in at is are and or us our we this that with me i my would please be it on as what".split(" "));

  // ---------- Text helpers ----------

  // Lowercase words separated by single spaces; keeps non-English letters (e.g. Bangla),
  // drops "'s" ("Applicant's Name" → "applicant name") and leading zeros ("04 Years" → "4 years").
  function norm(text) {
    return String(text || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/['’]s\b/gi, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
      .replace(/\b0+(\d)/g, "$1")
      .trim();
  }

  // Visible text of an element, ignoring form controls inside it (e.g. a <select>'s options).
  function textOf(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, option, script, style").forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }

  // Text that appears just before the element (for fields without a proper label).
  function nearbyText(el) {
    for (let node = el, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        const text = textOf(sib);
        if (text) return text.slice(0, 200);
      }
    }
    return "";
  }

  function ariaLabel(el) {
    const parts = [];
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) parts.push(textOf(document.getElementById(id)));
    }
    parts.push(el.getAttribute("aria-label") || "");
    return parts.filter(Boolean).join(" ");
  }

  function labelText(el) {
    const parts = [];
    if (el.labels) for (const label of el.labels) parts.push(textOf(label));
    parts.push(ariaLabel(el));
    parts.push(el.getAttribute("placeholder") || "");
    // Skip repeats (a placeholder often repeats the label).
    const seen = new Set();
    const text = parts.filter((part) => part && !seen.has(norm(part)) && seen.add(norm(part))).join(" ");
    return text || el.getAttribute("title") || nearbyText(el);
  }

  function attrText(el) {
    return norm(`${el.getAttribute("name") || ""} ${el.id || ""}`);
  }

  function sectionTitle(el) {
    const fieldset = el.closest("fieldset");
    const legend = fieldset && fieldset.querySelector(":scope > legend");
    return legend ? textOf(legend) : "";
  }

  // Which part of the form a field is in: its <fieldset> legend plus its name/id.
  function sectionText(el) {
    return norm(`${sectionTitle(el)} ${attrText(el)}`);
  }

  function isRequired(el, label) {
    return el.required || el.getAttribute("aria-required") === "true" || /\*/.test(label || "");
  }

  function shortLabel(label) {
    return label.replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
  }

  // ---------- Deciding what goes in a field ----------

  function findRule(text, isTextarea, section) {
    const t = norm(text);
    if (!t) return null;
    for (const rule of RULES) {
      if (rule.textareaOnly && !isTextarea) continue;
      if (rule.section && !rule.section.test(section)) continue;
      if (rule.kind === "text" && t.length > 80) continue;
      if (rule.test.test(t) && !(rule.not && rule.not.test(t))) return rule;
    }
    return null;
  }

  function ruleValue(rule, profile, el) {
    const value = rule.value ? rule.value(profile, el) : get(profile, rule.key);
    return value ? String(value) : "";
  }

  function tokens(text) {
    return norm(text).split(" ").filter((w) => w && !STOP_WORDS.has(w));
  }

  function similarity(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let common = 0;
    for (const w of A) if (B.has(w)) common++;
    return (2 * common) / (A.size + B.size);
  }

  function bestSavedAnswer(question, savedAnswers) {
    const q = norm(question);
    let best = null;
    let bestScore = 0;
    for (const item of savedAnswers) {
      const sq = norm(item.question);
      if (!sq || !item.answer) continue;
      const score = q === sq ? 1 : sq.length > 10 && q.includes(sq) ? 0.9 : similarity(q, sq);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return { item: best, answer: best && best.answer, score: bestScore };
  }

  // Where an answer the user types into this field should be saved:
  // a profile key, null (as a saved answer) or false (don't offer to save).
  function storeKey(rule, el) {
    const store = "store" in rule ? (typeof rule.store === "function" ? rule.store(el) : rule.store) : rule.key;
    // Profile dates must be YYYY-MM-DD, which only date inputs guarantee.
    if (store && DATE_KEYS.has(store) && el.type !== "date") return null;
    return store;
  }

  // Returns { key, value, store } for a field; value is "" when we have nothing to put there.
  function resolve(el, label, ctx, { isTextarea = false } = {}) {
    const saved = bestSavedAnswer(label, ctx.saved);
    if (saved.score >= 0.8) return { key: "savedAnswer", value: saved.answer, store: null };

    const section = sectionText(el);
    let rule = findRule(label, isTextarea, section);
    if (!rule) {
      const hint = (el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/).pop();
      const key = AUTOCOMPLETE[hint];
      rule = key ? RULES.find((r) => r.key === key) : findRule(attrText(el), isTextarea, section);
    }
    if (rule) {
      return { key: rule.key, value: ruleValue(rule, ctx.profile, el), store: storeKey(rule, el) };
    }

    return { key: null, value: "", store: null };
  }

  // Patterns for choosing an option that means the same as a saved answer.
  function answerPatterns(value) {
    const v = norm(value);
    if (DECLINE.test(v)) return [DECLINE];
    if (v === "yes") return [/^yes\b/, /^y$/, /^true$/];
    if (v === "no") return [/^no\b/, /^n$/, /^false$/];
    if (v.startsWith("i identify as one or more")) return [/identify as (one or more|a (protected )?veteran)/, /^i am a (protected )?veteran/, /^yes\b/];
    if (v.startsWith("i am not a protected veteran")) return [/not a (protected )?veteran/, /^no\b/];
    if (v.startsWith("yes i have a disability")) return [/^yes\b/];
    if (v.startsWith("no i do not have a disability")) return [/^no\b/];
    if (v === "male") return [/^(male|man)\b/];
    if (v === "female") return [/^(female|woman)\b/];
    if (v === "non binary") return [/non ?binary/];
    if (v.startsWith("american indian")) return [/american indian|alaska/];
    if (v === "asian") return [/^asian/];
    if (v.startsWith("black")) return [/black|african american/];
    if (v.startsWith("native hawaiian")) return [/hawaiian|pacific islander/];
    if (v === "white") return [/^white/];
    if (v.startsWith("two or more")) return [/two or more|multi|mixed/];
    return null;
  }

  // Index of the option text that best matches `value`, or -1.
  function pickOption(optionTexts, value) {
    const texts = optionTexts.map(norm);
    const patterns = answerPatterns(value);
    if (patterns) {
      for (const re of patterns) {
        const i = texts.findIndex((t) => t && re.test(t));
        if (i !== -1) return i;
      }
      return -1;
    }

    const v = norm(value);
    if (!v) return -1;
    let best = -1;
    let bestScore = 0;
    texts.forEach((t, i) => {
      if (!t || PLACEHOLDER.test(t)) return;
      let score = 0;
      if (t === v) score = 100;
      else if (t.startsWith(v) || (t.length >= 3 && v.startsWith(t))) score = 80;
      else if (t.includes(v) || (t.length >= 4 && v.includes(t))) score = 60;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  // ---------- Changing fields so page frameworks (React, Vue, Angular) notice ----------

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  }

  function fireChange(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur"));
  }

  function press(el) {
    const opts = { bubbles: true, cancelable: true, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function mark(el) {
    if (!el) return;
    el.style.setProperty("outline", "2px solid #22c55e", "important");
    el.style.setProperty("outline-offset", "1px", "important");
    el.addEventListener("focus", () => {
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
    }, { once: true });
  }

  // Adapts a stored value to what the input accepts.
  function formatForInput(el, key, value) {
    const type = (el.type || "").toLowerCase();
    if (type === "number") return value.replace(/[^0-9.]/g, "") || null;
    if (type === "date") return DATE_KEYS.has(key) ? value : null;
    // A saved date only goes into a date picker; a text box's date format is unknown.
    if (DATE_KEYS.has(key)) return null;
    return value;
  }

  // ---------- Field types ----------

  function attachFile(input, saved) {
    const [meta, base64] = saved.data.split(",");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const type = saved.type || (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], saved.name, { type }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.files.length > 0;
  }

  function isSelectEmpty(select) {
    const option = select.options[select.selectedIndex];
    return !option || option.value === "" || PLACEHOLDER.test(norm(option.textContent)) || !norm(option.textContent);
  }

  function optionText(input) {
    const label = input.labels && input.labels[0];
    return (label && textOf(label)) || ariaLabel(input) || textOf(input.nextElementSibling) || input.value || "";
  }

  // The question a group of radio buttons/checkboxes is answering.
  function groupQuestion(inputs) {
    const group = inputs[0].closest('fieldset, [role="radiogroup"], [role="group"]');
    // Only when the group holds just these inputs; otherwise it's a whole form section.
    if (group && group.querySelectorAll('input:not([type="hidden"]), select, textarea').length === inputs.length) {
      const legend = group.querySelector("legend");
      const text = (legend && textOf(legend)) || ariaLabel(group);
      if (text) return text;
    }
    let ancestor = inputs[0].parentElement;
    while (ancestor && !inputs.every((i) => ancestor.contains(i))) ancestor = ancestor.parentElement;
    const options = inputs.map(optionText).filter(Boolean);
    for (let node = ancestor, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
      let text = textOf(node);
      for (const option of options) text = text.replace(option, " ");
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 1) return text.slice(0, 400);
    }
    return ancestor ? nearbyText(ancestor) : "";
  }

  function isComboEmpty(el) {
    if (el.tagName === "INPUT") {
      if (el.value) return false;
      const container = el.closest('[class*="control"]') || (el.parentElement && el.parentElement.parentElement);
      const text = norm(textOf(container));
      return !text || PLACEHOLDER.test(text);
    }
    const text = norm(textOf(el));
    return !text || PLACEHOLDER.test(text);
  }

  function visibleOptions(el) {
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const list = id && document.getElementById(id);
    let options = [...(list || document).querySelectorAll('[role="option"]')].filter(isVisible);
    if (!options.length) options = [...document.querySelectorAll('[class*="menu"] [class*="option"]')].filter(isVisible);
    return options;
  }

  // Custom dropdowns (React Select, Workday, …): open, find the option, click it.
  async function fillCombobox(el, value) {
    const isInput = el.tagName === "INPUT";
    el.focus();
    press(isInput ? el.closest('[class*="control"]') || el : el);
    await sleep(250);

    let options = visibleOptions(el);
    let typed = false;
    if (isInput && pickOption(options.map(textOf), value) === -1) {
      // Searchable dropdown: type the answer and wait for suggestions.
      setNativeValue(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      typed = true;
      await sleep(900);
      options = visibleOptions(el);
    }

    const i = pickOption(options.map(textOf), value);
    if (i !== -1) {
      press(options[i]);
      await sleep(150);
      el.blur();
      return true;
    }

    if (typed) {
      setNativeValue(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    el.blur();
    return false;
  }

  // ---------- Offering to save what the user fills in ----------
  // After filling, we remember each field's value. When the user fills in or changes a field,
  // a small box offers to save the new answers: to the profile when we know which profile key
  // the field is, otherwise as a saved answer to the field's question.

  // Unsaved answers are also kept in chrome.storage.local ("unsavedAnswers"), so they still
  // show up in the box after the page is closed, the next time the filler runs on any page.

  // Kept on window so re-running the filler on the same page reuses one set of listeners.
  const state = window.__formFillerState || (window.__formFillerState = {
    // Fields on this page: element (first radio of a group) → { target, kind, question, store, original, ready }
    tracked: new Map(),
    // Unsaved answers from earlier visits: key → { stored: true, question, store, value, site }
    stored: new Map(),
    rows: new Map(), changes: [], ctx: null, running: false, saving: false, timer: null, host: null,
    // After "Not now" / "×": key → value on show then; the box stays closed until something new is typed.
    snoozed: null,
    // Keys of rows the user unticked; they stay unticked when the box comes back.
    unticked: new Set(),
    // Keys this page has read from or written to storage, so it can remove them once handled.
    knownKeys: new Set(),
  });

  const NEVER_SAVE = /captcha|verification code|password|\botp\b|security code/;

  // Same key → same saved value (one profile key, or one saved-answer question).
  function entryKey(entry) {
    return entry.store ? `profile:${entry.store}` : `question:${norm(entry.question)}`;
  }

  function track(target, kind, label, store, ready = false) {
    const key = kind === "group" ? target[0] : target;
    if (store === false || state.tracked.has(key)) return;
    const question = label.replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (NEVER_SAVE.test(norm(question)) || (!store && !question)) return;
    state.tracked.set(key, { target, kind, question, store, original: "", ready });
  }

  // Fields we didn't see while filling (e.g. ones that appear after an earlier choice)
  // are tracked the first time the user types in them.
  function trackLate(el) {
    if (!state.ctx || !(el instanceof Element)) return;
    if (el.tagName === "SELECT") {
      if (!state.tracked.has(el)) track(el, "select", labelText(el), resolve(el, labelText(el), state.ctx).store, true);
    } else if (el.type === "radio") {
      const inputs = el.name
        ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)]
        : [el];
      if (![...state.tracked.keys()].some((key) => inputs.includes(key))) {
        const question = groupQuestion(inputs);
        track(inputs, "group", question, resolve(inputs[0], question, state.ctx).store, true);
      }
    } else if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && TEXT_TYPES.has((el.getAttribute("type") || "text").toLowerCase()))) {
      if (el.getAttribute("role") === "combobox" || state.tracked.has(el)) return;
      const label = labelText(el);
      track(el, "text", label, resolve(el, label, state.ctx, { isTextarea: el.tagName === "TEXTAREA" }).store, true);
    }
  }

  function currentValue(entry) {
    const { target, kind } = entry;
    if (kind === "select") return isSelectEmpty(target) ? "" : target.options[target.selectedIndex].textContent.trim();
    if (kind === "group") {
      const checked = target.find((input) => input.checked);
      return checked ? optionText(checked) : "";
    }
    return target.value.trim();
  }

  function isConnected(entry) {
    return Array.isArray(entry.target) ? entry.target[0].isConnected : entry.target.isConnected;
  }

  // Answers typed on this page, plus earlier unsaved ones (unless this page has a newer one).
  function pendingChanges() {
    const changes = [];
    const keys = new Set();
    for (const entry of state.tracked.values()) {
      if (!entry.ready || !isConnected(entry)) continue;
      const value = currentValue(entry);
      if (value && value !== entry.original && !keys.has(entryKey(entry))) {
        changes.push({ entry, value });
        keys.add(entryKey(entry));
      }
    }
    for (const [key, entry] of state.stored) {
      if (!keys.has(key)) changes.push({ entry, value: entry.value });
    }
    return changes;
  }

  // Writes this page's unsaved answers to storage, leaving other tabs' answers alone.
  async function persistUnsaved(changes) {
    const { unsavedAnswers = [] } = await chrome.storage.local.get("unsavedAnswers");
    const byKey = new Map(unsavedAnswers.map((item) => [entryKey(item), item]));
    for (const key of state.knownKeys) byKey.delete(key);
    for (const { entry, value } of changes) {
      const key = entryKey(entry);
      state.knownKeys.add(key);
      byKey.set(key, {
        question: entry.question, store: entry.store || null, value,
        site: entry.site || location.hostname, unticked: state.unticked.has(key),
      });
    }
    await chrome.storage.local.set({ unsavedAnswers: [...byKey.values()].slice(-100) });
  }

  function onFieldEvent(event) {
    if (state.running) return;
    trackLate(event.target);
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshSaveBox, 600);
  }

  // The box always lists every unsaved answer. Once closed, it reopens only when the user
  // types or changes something new.
  function refreshSaveBox() {
    if (state.running || state.saving) return;
    const changes = pendingChanges();
    persistUnsaved(changes).catch(() => {});
    if (!changes.length) {
      hideSaveBox();
      return;
    }
    if (!state.host && state.snoozed && changes.every(({ entry, value }) => state.snoozed.get(entryKey(entry)) === value)) return;
    state.snoozed = null;
    renderSaveBox(changes);
  }

  function snooze(changes) {
    state.snoozed = new Map(changes.map(({ entry, value }) => [entryKey(entry), value]));
  }

  // The answer is dealt with: saved, or thrown away with the row's ✕.
  function settle({ entry, value }) {
    if (!entry.stored) entry.original = value;
    state.stored.delete(entryKey(entry));
    state.unticked.delete(entryKey(entry));
  }

  async function saveChanges(changes) {
    const data = await chrome.storage.local.get(["profile", "savedAnswers"]);
    const profile = data.profile || {};
    const savedAnswers = data.savedAnswers || [];
    for (const { entry, value } of changes) {
      if (entry.store) {
        profile[entry.store] = value;
      } else {
        const similar = bestSavedAnswer(entry.question, savedAnswers);
        const match = savedAnswers.find((item) => norm(item.question) === norm(entry.question))
          || (similar.score >= 0.8 && similar.item);
        if (match) match.answer = value;
        else savedAnswers.push({ question: entry.question, answer: value });
      }
    }
    await chrome.storage.local.set({ profile, savedAnswers });
    for (const change of changes) settle(change);
    await persistUnsaved(pendingChanges());
    // Use the new answers the next time "Fill this page" runs on this page.
    if (state.ctx) Object.assign(state.ctx, { profile, saved: savedAnswers });
  }

  const SAVE_BOX_STYLE = `
    .box { width: 340px; max-height: 70vh; display: flex; flex-direction: column; background: #fff; color: #1f2937;
      border: 1px solid #d1d5db; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px 6px; font-weight: 700; font-size: 15px; }
    .close { border: none; background: none; font-size: 18px; cursor: pointer; color: #6b7280; padding: 0 4px; }
    .sub { padding: 0 14px 8px; color: #6b7280; font-size: 13px; }
    .list { overflow-y: auto; padding: 0 14px; }
    label { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid #f3f4f6; cursor: pointer; }
    input { margin-top: 3px; }
    .text { flex: 1; min-width: 0; }
    .q { font-weight: 600; }
    .v { color: #374151; word-break: break-word; }
    .site { color: #9ca3af; font-size: 12px; }
    .discard { border: none; background: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .discard:hover { color: #b91c1c; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 14px 12px; }
    button.btn { border-radius: 6px; padding: 7px 14px; font: inherit; font-weight: 600; cursor: pointer; }
    .save { background: #2563eb; color: #fff; border: 1px solid #2563eb; }
    .later { background: #fff; color: #374151; border: 1px solid #d1d5db; }
    .done { padding: 14px; font-weight: 700; color: #15803d; }`;

  function createSaveBox() {
    state.host = document.createElement("div");
    state.host.style.cssText = "all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;";
    const root = state.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SAVE_BOX_STYLE}</style>
      <div class="box">
        <div class="head"><span>Do you want to update your saved info?</span><button class="close" title="Close">×</button></div>
        <div class="sub">Save these answers so Form Filler can fill them for you next time.</div>
        <div class="list"></div>
        <div class="actions"><button class="btn later">Not now</button><button class="btn save">Save</button></div>
      </div>`;
    document.documentElement.appendChild(state.host);

    // "Not now" only closes the box; the answers stay unsaved and come back later.
    const dismiss = () => {
      snooze(state.changes);
      hideSaveBox();
    };
    root.querySelector(".close").addEventListener("click", dismiss);
    root.querySelector(".later").addEventListener("click", dismiss);
    root.querySelector(".save").addEventListener("click", async () => {
      const chosen = state.changes.filter(({ entry }) => state.rows.get(entry).checkbox.checked);
      snooze(state.changes.filter((change) => !chosen.includes(change)));
      state.saving = true;
      const box = root.querySelector(".box");
      try {
        await saveChanges(chosen);
        box.innerHTML = `<div class="done">Saved ✓</div>`;
      } catch (err) {
        box.innerHTML = `<div class="done" style="color:#b91c1c"></div>`;
        box.firstChild.textContent = `Could not save: ${(err && err.message) || err}`;
      }
      setTimeout(() => {
        state.saving = false;
        hideSaveBox();
        refreshSaveBox();
      }, 1500);
    });
  }

  // Updates the box in place, so rows the user unticked stay unticked while they keep typing.
  function renderSaveBox(changes) {
    if (!state.host || !state.host.isConnected) {
      state.rows.clear();
      createSaveBox();
    }
    const list = state.host.shadowRoot.querySelector(".list");
    const current = new Set(changes.map(({ entry }) => entry));
    for (const [entry, row] of state.rows) {
      if (!current.has(entry)) {
        row.element.remove();
        state.rows.delete(entry);
      }
    }
    for (const change of changes) {
      const { entry, value } = change;
      const key = entryKey(entry);
      let row = state.rows.get(entry);
      if (!row) {
        const element = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !state.unticked.has(key);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) state.unticked.delete(key);
          else state.unticked.add(key);
          persistUnsaved(state.changes).catch(() => {});
        });
        const text = document.createElement("span");
        text.className = "text";
        const q = document.createElement("div");
        q.className = "q";
        q.textContent = shortLabel(entry.question) || "Field";
        const v = document.createElement("div");
        v.className = "v";
        text.append(q, v);
        if (entry.stored && entry.site && entry.site !== location.hostname) {
          const site = document.createElement("div");
          site.className = "site";
          site.textContent = `from ${entry.site}`;
          text.append(site);
        }
        const discard = document.createElement("button");
        discard.className = "discard";
        discard.title = "Don't save this";
        discard.textContent = "\u2715";
        discard.addEventListener("click", (event) => {
          event.preventDefault();
          const latest = state.changes.find((c) => c.entry === entry) || change;
          settle(latest);
          refreshSaveBox();
        });
        element.append(checkbox, text, discard);
        list.appendChild(element);
        row = { element, checkbox, valueEl: v };
        state.rows.set(entry, row);
      }
      row.valueEl.textContent = value.length > 80 ? `${value.slice(0, 80)}…` : value;
    }
    state.changes = changes;
  }

  function hideSaveBox() {
    if (state.host) state.host.remove();
    state.host = null;
    state.rows.clear();
  }

  if (!state.listening) {
    state.listening = true;
    document.addEventListener("input", onFieldEvent, true);
    document.addEventListener("change", onFieldEvent, true);
  }

  // ---------- Main ----------

  async function run() {
    const data = await chrome.storage.local.get(["profile", "savedAnswers", "resume", "coverLetterFile", "unsavedAnswers"]);
    const ctx = { profile: data.profile || {}, saved: data.savedAnswers || [] };
    state.ctx = ctx;
    state.running = true;
    hideSaveBox();

    // Keep what the user already typed on this page; drop fields that are gone.
    for (const [key, entry] of state.tracked) if (!isConnected(entry)) state.tracked.delete(key);

    // Earlier unsaved answers, from this page or others.
    state.stored.clear();
    for (const item of data.unsavedAnswers || []) {
      if (!item || !item.value || NEVER_SAVE.test(norm(item.question))) continue;
      const entry = { stored: true, question: item.question, store: item.store, value: item.value, site: item.site };
      const key = entryKey(entry);
      state.stored.set(key, entry);
      state.knownKeys.add(key);
      if (item.unticked) state.unticked.add(key);
    }

    const fileMissing = [];
    let filled = fillFiles(data, fileMissing);

    // Some dropdowns only get their options after an earlier one changes (District → Upazila),
    // so repeat while each round still fills something.
    let missing = [];
    for (let round = 0; round < 4; round++) {
      const result = await fillFields(ctx);
      filled += result.filled;
      missing = result.missing;
      if (!result.filled) break;
      await sleep(1200);
    }

    // From here on, changes to newly seen fields are the user's own.
    for (const entry of state.tracked.values()) {
      if (entry.ready) continue;
      entry.original = currentValue(entry);
      entry.ready = true;
    }
    state.running = false;

    // Show any unsaved answers right away.
    state.snoozed = null;
    refreshSaveBox();
    return { filled, missing: [...new Set([...fileMissing, ...missing].filter(Boolean))] };
  }

  function fillFiles(data, missing) {
    let filled = 0;
    // Files (often hidden behind a custom "Attach" button, so don't require visibility).
    const fileInputs = [...document.querySelectorAll('input[type="file"]')].filter((i) => !i.disabled);
    for (const input of fileInputs) {
      if (input.files.length) continue;
      const label = labelText(input);
      const text = norm(`${label} ${attrText(input)}`);
      const key = /cover/.test(text) ? "coverLetterFile"
        : /resume|\bcv\b|curriculum/.test(text) ? "resume"
        : null;
      if (key && data[key] && attachFile(input, data[key])) {
        filled++;
        mark(isVisible(input) ? input : input.parentElement);
      } else if (isRequired(input, label)) {
        missing.push(shortLabel(label) || "File upload");
      }
    }
    return filled;
  }

  async function fillFields(ctx) {
    let filled = 0;
    const missing = [];

    // Text boxes and text areas.
    for (const el of document.querySelectorAll("input, textarea")) {
      const isTextarea = el.tagName === "TEXTAREA";
      if (!isTextarea && !TEXT_TYPES.has((el.getAttribute("type") || "text").toLowerCase())) continue;
      if (el.disabled || el.readOnly || el.value || !isVisible(el)) continue;
      if (el.getAttribute("role") === "combobox") continue;

      const label = labelText(el);
      const answer = resolve(el, label, ctx, { isTextarea });
      track(el, "text", label, answer.store);
      const value = answer.value && formatForInput(el, answer.key, answer.value);
      if (value) {
        setNativeValue(el, value);
        fireChange(el);
        mark(el);
        filled++;
      } else if (isRequired(el, label)) {
        missing.push(shortLabel(label));
      }
    }

    // Native dropdowns (hidden ones too, as long as their wrapper is visible).
    for (const select of document.querySelectorAll("select")) {
      if (select.disabled || !isSelectEmpty(select)) continue;
      if (!isVisible(select) && !isVisible(select.parentElement)) continue;

      const label = labelText(select);
      const answer = resolve(select, label, ctx);
      track(select, "select", label, answer.store);
      const options = [...select.options];
      const i = answer.value ? pickOption(options.map((o) => o.textContent), answer.value) : -1;
      if (i !== -1 && options[i].value !== "") {
        setNativeValue(select, options[i].value);
        fireChange(select);
        mark(isVisible(select) ? select : select.parentElement);
        filled++;
      } else if (isRequired(select, label)) {
        missing.push(shortLabel(label));
      }
    }

    // Radio buttons and checkboxes, grouped by name (or by container when unnamed).
    const groups = new Map();
    for (const input of document.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
      if (input.disabled) continue;
      const label = input.labels && input.labels[0];
      if (!isVisible(input) && !isVisible(label) && !isVisible(input.parentElement)) continue;
      const key = input.name
        ? `${input.type}|${input.name}`
        : input.closest('fieldset, [role="radiogroup"], [role="group"]') || input.parentElement.parentElement;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(input);
    }
    for (const inputs of groups.values()) {
      if (inputs.some((i) => i.checked)) continue;
      const single = inputs.length === 1 && inputs[0].type === "checkbox";
      // A lone checkbox's own label is the question; add the section title for context.
      const question = single ? `${optionText(inputs[0])} ${sectionTitle(inputs[0])}` : groupQuestion(inputs);
      const answer = resolve(inputs[0], question, ctx);
      if (!single) track(inputs, "group", question, answer.store);

      let target = null;
      if (single) {
        if (norm(answer.value) === "yes") target = inputs[0];
      } else if (answer.value) {
        const i = pickOption(inputs.map(optionText), answer.value);
        if (i !== -1) target = inputs[i];
      }

      if (target) {
        target.click();
        mark((target.labels && target.labels[0]) || target.parentElement);
        filled++;
      } else if (inputs.some((i) => isRequired(i, question))) {
        missing.push(shortLabel(question));
      }
    }

    // Custom dropdowns, one at a time since each opens a menu.
    const combos = [...document.querySelectorAll('[role="combobox"], button[aria-haspopup="listbox"]')]
      .filter((el) => el.tagName !== "SELECT" && !el.disabled && isVisible(el));
    for (const el of combos) {
      if (combos.some((other) => other !== el && el.contains(other))) continue;
      if (!isComboEmpty(el)) continue;

      const label = labelText(el);
      const answer = resolve(el, label, ctx);
      if (answer.value && (await fillCombobox(el, answer.value))) {
        mark(el.closest('[class*="control"]') || el);
        filled++;
      } else if (isRequired(el, label)) {
        missing.push(shortLabel(label));
      }
    }

    return { filled, missing };
  }

  window.__formFillerRun = async () => {
    try {
      return await run();
    } catch (err) {
      state.running = false;
      return { filled: 0, missing: [], error: String((err && err.message) || err) };
    }
  };
})();
