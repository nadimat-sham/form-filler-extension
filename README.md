# Form Filler

A free Chrome extension that fills job application forms with your saved information, in one click.

- Works on common job sites (Greenhouse, Lever, Workday and many others) and on **Bangladesh government job forms** (Teletalk).
- Fills text boxes, dropdowns, Yes/No questions, your resume and cover letter.
- **Learns as you go:** after you fill in the fields it couldn't, it offers to save your answers for next time.
- **Private:** everything stays on your own computer. No account, no server, no tracking.

---

## Install (about 2 minutes)

The extension isn't on the Chrome Web Store, so you install it yourself. It's easy:

### 1. Download

1. On this GitHub page, click the green **Code** button.
2. Click **Download ZIP**.

### 2. Unzip

1. Find the downloaded ZIP file (usually in your **Downloads** folder).
2. Right-click it and choose **Extract All…** (Windows) or **Extract Here** (Linux), or double-click it (Mac).
3. Move the extracted folder somewhere you'll keep it, for example **Documents**.

> ⚠️ Don't delete or move this folder later. Chrome runs the extension from it.

### 3. Add it to Chrome

1. Open Chrome and type `chrome://extensions` in the address bar, then press Enter.
2. Turn on **Developer mode** (switch in the top-right corner).
3. Click **Load unpacked** (top-left).
4. Select the extracted folder, the one that has `manifest.json` directly inside it.

**Form Filler** now appears in your extensions list.

### 4. Pin it to the toolbar

1. Click the **puzzle-piece icon** 🧩 to the right of the address bar.
2. Click the **pin** 📌 next to **Form Filler**.

A gray **F** icon now appears in your toolbar.

---

## Set up your information

1. Click the **F** icon, then **Edit my information**.
2. Fill in what applies to you. Every field is optional:
   - **Personal, Links, Work, Education**
   - **Bangladesh job forms:** Bangla name, parents' names, NID, present and permanent address, SSC/HSC/Graduation/Masters results
   - **Work eligibility** and **Voluntary self-identification** (Yes/No and diversity questions)
   - **Cover letter:** your default cover letter text
   - **Files:** your resume and an optional cover letter file
   - **Saved answers:** questions that come up often, like "Why do you want to work here?"
3. Click **Save** at the bottom.

> 💡 For dropdown answers, type them the way forms usually show them, for example `Dhaka`, `S.S.C`, `GPA(out of 5)`, or the university's full name instead of its short form.

---

## Fill a form

1. Open a job application page.
2. Click the **F** icon, then **Fill this page**.
3. Filled fields get a **green outline**. The popup tells you how many were filled and lists any required fields that are still empty.
4. **Fill in the rest yourself.** A box appears at the bottom-right: **"Do you want to update your saved info?"** Click **Save** and those answers are filled automatically next time.
5. **Always check the form before you submit.**

It never overwrites anything already typed in a field, and it never fills captchas, passwords or declaration checkboxes. Those are for you.

---

## Update to a new version

1. Download the new ZIP from this page and unzip it.
2. Replace the files in your existing Form Filler folder with the new ones.
3. Go to `chrome://extensions` and click the **reload icon ↻** on the Form Filler card.
4. Reload any open job application tabs.

Your saved information is kept.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Didn't find any fields I could fill" | Reload the page (F5) and try again. Some forms only show fields after you click "Apply" or pick an earlier option. |
| Nothing happens after updating the extension | Reload the job application page. Pages opened before the update don't see the new version. |
| "Chrome doesn't allow extensions on this page" | Chrome blocks extensions on its own pages (`chrome://…`) and on the Web Store. Use it on a real application page. |
| Chrome says "Disable developer mode extensions?" | Click **Keep** or close the message. Chrome shows this for any extension not installed from the Web Store. |
| A dropdown wasn't filled | Your saved answer may not match the form's options. Fill it yourself and click **Save** in the update box. |
| The form is inside a box from another website | Chrome may block the extension there. Open that box's page in its own tab if you can. |

---

## Privacy

- All your information, files and saved answers are stored **only in your own Chrome** (`chrome.storage.local`).
- Nothing is sent anywhere. The extension has no server and makes no network requests.
- The extension only runs on a page when you click **Fill this page**.
- Removing the extension deletes all its saved data.

---

## For developers

Plain HTML, CSS and JavaScript (Manifest V3). No build step and no dependencies.

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension settings and permissions |
| `options.html` / `.js` / `.css` | The "My Information" page |
| `popup.html` / `.js` / `.css` | The toolbar popup |
| `filler.js` | Injected into the page; recognizes and fills fields, and offers to save new answers |

To change how a field is recognized, edit the `RULES` list near the top of `filler.js`, then click ↻ on `chrome://extensions`.
