import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmHZw0NogvE9CClsbWUngRROFXoVRB_aM",
  authDomain: "house-of-balloon-crm.firebaseapp.com",
  projectId: "house-of-balloon-crm",
  storageBucket: "house-of-balloon-crm.firebasestorage.app",
  messagingSenderId: "38190937524",
  appId: "1:38190937524:web:2e89c3e7c1f13863c12ee1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const leadsCol = collection(db, "hob_leads");

// फ़ोन नंबर से सुरक्षित Doc ID ('p' + 10 अंक) निकालने का फ़ंक्शन
function docIdFromLead(leadData) {
  if (!leadData) return null;
  const raw = leadData.phone || leadData.id || leadData.p;
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? "p" + digits : null;
}

// 1. क्लाउड में लीड सेव करने के लिए (Strict Schema: j और u)
async function saveLeadToFirestore(leadData) {
  try {
    const id = docIdFromLead(leadData);
    if (!id) {
      console.warn("Invalid lead phone for Firestore doc ID:", leadData);
      return null;
    }

    const payload = {
      j: JSON.stringify(leadData),
      u: Date.now()
    };

    await setDoc(doc(db, "hob_leads", id), payload);
    console.log("Cloud Save Success ID:", id);
    return id;
  } catch (e) {
    console.error("Cloud Save Error:", e);
    return null;
  }
}

// 2. क्लाउड से सारा डेटा लोड करने के लिए (JSON Parse के साथ)
async function loadAllLeadsFromFirestore() {
  try {
    const snapshot = await getDocs(leadsCol);
    const leads = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || !data.j) return;
      try {
        const lead = JSON.parse(data.j);
        leads.push({ ...lead, id: docSnap.id });
      } catch (err) {
        console.warn("Failed to parse lead JSON:", docSnap.id, err);
      }
    });
    return leads;
  } catch (e) {
    console.error("Cloud Load Error:", e);
    return [];
  }
}

// 3. फ़ोन नंबर से एक विशिष्ट लीड ढूँढने के लिए
async function getLeadByPhoneFromFirestore(phone) {
  try {
    const digits = String(phone || "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) return null;
    const id = "p" + digits;

    const snap = await getDoc(doc(db, "hob_leads", id));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data || !data.j) return null;

    return { ...JSON.parse(data.j), id: snap.id };
  } catch (e) {
    console.error("Cloud Get Error:", e);
    return null;
  }
}

// 4. लाइव ऑटो-सिंक (सभी यूज़र और डिवाइसों के लिए रियल-टाइम अपडेट)
function listenToLeads(onUpdate) {
  return onSnapshot(leadsCol, (snapshot) => {
    const leads = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || !data.j) return;
      try {
        const lead = JSON.parse(data.j);
        leads.push({ ...lead, id: docSnap.id });
      } catch (err) {
        console.warn("Failed to parse realtime JSON:", docSnap.id, err);
      }
    });
    if (typeof onUpdate === "function") {
      onUpdate(leads);
    }
  }, (err) => {
    console.error("Firestore Listen Error:", err);
  });
}

// पुराने और नए दोनों नामों से global window पर जोड़ना
window.saveLeadToCloud = saveLeadToFirestore;
window.saveLeadToFirestore = saveLeadToFirestore;

window.loadLeadsFromCloud = loadAllLeadsFromFirestore;
window.loadAllLeadsFromFirestore = loadAllLeadsFromFirestore;

window.listenToCloudSync = listenToLeads;
window.listenToLeads = listenToLeads;

window.getLeadByPhoneFromCloud = getLeadByPhoneFromFirestore;
window.getLeadByPhoneFromFirestore = getLeadByPhoneFromFirestore;

const ACTIVE_TAB_KEY = "hob_active_tab";
const CALL_OPTION_KEY = "hob_call_labels";
const CALL_OPTION_COLORS = {
  Green: "#15803D",
  Red: "#B91C1C",
  Orange: "#EA580C",
  Blue: "#2563EB",
  Purple: "#7C3AED",
  Teal: "#0D9488",
  Gray: "#6B7280"
};

const DEFAULT_CALL_OPTIONS = [
  { n: "Interested", c: "Green" },
  { n: "Not Interested", c: "Red" },
  { n: "Wrong Number", c: "Gray" }
];

function normalizeCallLabel(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.n || value.name || "").trim();
  if (!name) return null;
  const color = Object.prototype.hasOwnProperty.call(CALL_OPTION_COLORS, value.c || value.color || "Gray")
    ? (value.c || value.color || "Gray")
    : "Gray";
  return { n: name, c: color };
}

function readCallLabelOptions() {
  try {
    const raw = localStorage.getItem(CALL_OPTION_KEY);
    if (!raw) return DEFAULT_CALL_OPTIONS.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CALL_OPTIONS.slice();
    const normalized = parsed.map(normalizeCallLabel).filter(Boolean);
    return normalized.length ? normalized : DEFAULT_CALL_OPTIONS.slice();
  } catch (error) {
    return DEFAULT_CALL_OPTIONS.slice();
  }
}

function writeCallLabelOptions(nextOptions) {
  const options = (Array.isArray(nextOptions) ? nextOptions : readCallLabelOptions())
    .map(normalizeCallLabel)
    .filter(Boolean);
  const finalOptions = options.length ? options : DEFAULT_CALL_OPTIONS.slice();
  try {
    localStorage.setItem(CALL_OPTION_KEY, JSON.stringify(finalOptions));
  } catch (error) {
    // Ignore localStorage issues; app still functions.
  }
  return finalOptions;
}

async function syncCallLabelOptionsToMeta(nextOptions) {
  const options = writeCallLabelOptions(nextOptions);
  try {
    const metaRef = doc(db, "hob_meta", "state");
    const snap = await getDoc(metaRef);
    let existingMeta = {};
    if (snap.exists()) {
      const raw = snap.data();
      if (raw && raw.j) {
        try {
          existingMeta = JSON.parse(raw.j);
        } catch (error) {
          existingMeta = {};
        }
      }
    }
    existingMeta.callOptions = options;
    await setDoc(metaRef, { j: JSON.stringify(existingMeta), u: Date.now() });
  } catch (error) {
    console.warn("Could not sync call labels to hob_meta/state:", error);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function installCallLabelUI() {
  const sheet = document.querySelector("#dsp");
  if (!sheet) return;
  if (sheet.dataset.callLabelInstalled === "true") return;
  const statusWrap = sheet.querySelector(".opt3");
  if (!statusWrap) return;

  const options = readCallLabelOptions();
  const markup = `
    <div data-call-label-root style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
      <div class="row" style="justify-content:space-between;gap:8px;align-items:center;">
        <b style="font-size:13px;">Call labels</b>
        <button class="act" data-a="addcallopt" style="padding:8px 10px;">+ Add</button>
      </div>
      ${options.map((option, index) => {
        const color = CALL_OPTION_COLORS[option.c] || CALL_OPTION_COLORS.Gray;
        return `
          <div class="row" style="margin-top:6px;gap:6px;align-items:center;">
            <button class="op${(window.DS && window.DS.st === option.n) ? " on" : ""}" data-a="pickcallopt" data-v="${escapeHtml(option.n)}" style="--oc:${color};flex:1" aria-pressed="${window.DS && window.DS.st === option.n ? "true" : "false"}">${escapeHtml(option.n)}</button>
            <button class="ib" data-a="editcallopt" data-i="${index}" title="Edit ${escapeHtml(option.n)}" aria-label="Edit ${escapeHtml(option.n)}">✏️</button>
          </div>
        `;
      }).join("")}
    </div>
  `;

  statusWrap.insertAdjacentHTML("afterend", markup);
  sheet.dataset.callLabelInstalled = "true";

  const nameInput = sheet.querySelector("#hob_call_name_input");
  if (!nameInput) {
    const nameRow = document.createElement("div");
    nameRow.style.marginTop = "8px";
    nameRow.innerHTML = `
      <label for="hob_call_name_input" style="display:block;font-size:13px;color:var(--mute);margin:8px 0 4px;">Customer name</label>
      <input id="hob_call_name_input" value="" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--card);">
    `;
    statusWrap.parentNode.insertBefore(nameRow, statusWrap.nextSibling);
  }

  const lead = (typeof window.leadOf === "function" && window.DS) ? window.leadOf(window.DS.id) : null;
  const inputNode = sheet.querySelector("#hob_call_name_input");
  if (inputNode && lead && lead.name) inputNode.value = lead.name;
}

function refreshCallLabelUI() {
  const sheet = document.querySelector("#dsp");
  if (!sheet) return;
  const root = sheet.querySelector("[data-call-label-root]");
  if (root) root.remove();
  sheet.dataset.callLabelInstalled = "false";
  installCallLabelUI();
}

function showCallLabelEditor(index = -1) {
  const options = readCallLabelOptions();
  const current = index >= 0 ? options[index] || { n: "", c: "Green" } : { n: "", c: "Green" };
  const overlay = document.createElement("div");
  overlay.className = "sheet";
  overlay.innerHTML = `
    <div>
      <button class="sbk" data-a="closecallopteditor" type="button">← Back</button>
      <h2 style="margin-top:0">${index >= 0 ? "Edit label" : "New label"}</h2>
      <label style="display:block;font-size:13px;color:var(--mute);margin:10px 0 4px;">Label name</label>
      <input id="callopt_name_input" value="${escapeHtml(current.n)}" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--card);">
      <label style="display:block;font-size:13px;color:var(--mute);margin:10px 0 4px;">Badge color</label>
      <select id="callopt_color_input" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--card);">
        ${Object.keys(CALL_OPTION_COLORS).map((colorName) => `<option value="${colorName}" ${current.c === colorName ? "selected" : ""}>${colorName}</option>`).join("")}
      </select>
      <button class="save" data-a="savecallopt" data-i="${index}" type="button">Save</button>
      ${index >= 0 ? `<button class="save" style="background:var(--acc);margin-top:8px" data-a="deletecallopt" data-i="${index}" type="button">Delete</button>` : ""}
    </div>
  `;
  document.body.appendChild(overlay);
}

function persistActiveTab() {
  const selectedTab = document.querySelector('nav button.on') || document.querySelector('[data-a="tab"].on') || document.querySelector('button[data-t].on');
  if (!selectedTab) return;
  const tabName = selectedTab.getAttribute("data-t") || selectedTab.getAttribute("data-tab");
  if (tabName) localStorage.setItem(ACTIVE_TAB_KEY, tabName);
}

function restoreActiveTab() {
  const savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
  if (!savedTab) return;
  const buttons = document.querySelectorAll('[data-a="tab"][data-t], button[data-t]');
  buttons.forEach((button) => {
    const tabName = button.getAttribute("data-t") || button.getAttribute("data-tab");
    const isSelected = tabName === savedTab;
    button.classList.toggle("on", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
  if (typeof window.tab !== "undefined") {
    window.tab = savedTab;
  }
  if (typeof window.render === "function") {
    try { window.render(); } catch (error) { console.warn("Could not restore saved tab:", error); }
  }
}

document.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-a]");
  if (!actionTarget) return;
  const action = actionTarget.getAttribute("data-a");

  if (action === "addcallopt") {
    event.preventDefault();
    showCallLabelEditor(-1);
    return;
  }

  if (action === "editcallopt") {
    event.preventDefault();
    const index = Number(actionTarget.getAttribute("data-i"));
    showCallLabelEditor(index);
    return;
  }

  if (action === "closecallopteditor") {
    event.preventDefault();
    const overlay = actionTarget.closest(".sheet");
    if (overlay) overlay.remove();
    return;
  }

  if (action === "savecallopt") {
    event.preventDefault();
    const index = Number(actionTarget.getAttribute("data-i"));
    const overlay = actionTarget.closest(".sheet");
    const nameNode = overlay ? overlay.querySelector("#callopt_name_input") : null;
    const colorNode = overlay ? overlay.querySelector("#callopt_color_input") : null;
    const name = nameNode ? String(nameNode.value).trim() : "";
    const color = colorNode ? String(colorNode.value).trim() : "Gray";
    if (!name) return;

    const options = readCallLabelOptions();
    if (index >= 0 && index < options.length) {
      options[index] = { n: name, c: color };
    } else {
      options.push({ n: name, c: color });
    }
    writeCallLabelOptions(options);
    await syncCallLabelOptionsToMeta(options);
    if (overlay) overlay.remove();
    refreshCallLabelUI();
    return;
  }

  if (action === "deletecallopt") {
    event.preventDefault();
    const index = Number(actionTarget.getAttribute("data-i"));
    const options = readCallLabelOptions();
    if (index >= 0 && index < options.length) {
      options.splice(index, 1);
      writeCallLabelOptions(options);
      syncCallLabelOptionsToMeta(options);
    }
    const overlay = actionTarget.closest(".sheet");
    if (overlay) overlay.remove();
    refreshCallLabelUI();
    return;
  }

  if (action === "pickcallopt") {
    event.preventDefault();
    const value = actionTarget.getAttribute("data-v");
    if (!value) return;
    if (window.DS) {
      window.DS.st = value;
      const buttonGroup = actionTarget.closest("[data-call-label-root]");
      buttonGroup?.querySelectorAll("[data-a='pickcallopt']").forEach((btn) => {
        const selected = btn.getAttribute("data-v") === value;
        btn.classList.toggle("on", selected);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
    return;
  }

  if (action === "tab") {
    const tabName = actionTarget.getAttribute("data-t") || actionTarget.getAttribute("data-tab");
    if (tabName) localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    persistActiveTab();
  }
});

window.addEventListener("load", () => {
  restoreActiveTab();
  const observer = new MutationObserver(() => {
    const sheet = document.querySelector("#dsp");
    if (sheet) installCallLabelUI();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => installCallLabelUI(), 150);
});

// Keep the app's native tab flow intact; this code only adds safe persistence and call-label management.

window.addEventListener("input", (event) => {
  const nameInput = event.target.closest("#hob_call_name_input");
  if (!nameInput || !window.DS || !window.leadOf) return;
  const lead = window.leadOf(window.DS.id);
  if (!lead) return;
  lead.name = nameInput.value.trim() || lead.name || "Customer";
});

window.addEventListener("click", (event) => {
  const tabButton = event.target.closest('[data-a="tab"][data-t]') || event.target.closest('button[data-t]');
  if (!tabButton) return;
  const tabName = tabButton.getAttribute("data-t") || tabButton.getAttribute("data-tab");
  if (tabName) {
    localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    if (typeof window.tab !== "undefined") window.tab = tabName;
  }
});

if (document.readyState !== "loading") {
  restoreActiveTab();
}

// Safety: keep all existing hob_leads documents untouched and follow the existing strict schema on writes.
