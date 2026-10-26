import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmHZw0NogvE9CC1sbWUngRROFXoVRB_aM",
  authDomain: "house-of-balloon-crm.firebaseapp.com",
  projectId: "house-of-balloon-crm",
  storageBucket: "house-of-balloon-crm.firebasestorage.app",
  messagingSenderId: "38190937524",
  appId: "1:38190937524:web:2e89c3e7c1f13863c12ee1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.firebaseApp = app;
window.db = db;

// Make.com webhook configuration
const MAKE_WEBHOOK_URL = window.MAKE_WEBHOOK_URL || "YOUR_MAKE_WEBHOOK_URL_HERE";

let activeLeadId = null;
let threadUnsubscribe = null;
let currentThreadMessages = [];

// Utility: normalize phone numbers to a consistent format
function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10 && !digits.startsWith("91")) return `+${digits}`;
  if (digits.length > 10 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

// Make webhook helpers
async function sendToMakeWebhook(payload) {
  if (!MAKE_WEBHOOK_URL || MAKE_WEBHOOK_URL.includes("YOUR_MAKE_WEBHOOK_URL_HERE")) {
    console.warn("Make webhook is not configured. Skipping outbound webhook call.");
    return {
      ok: false,
      skipped: true,
      reason: "Make webhook not configured"
    };
  }

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Make webhook request failed:", response.status, response.statusText, errorText);
      return {
        ok: false,
        status: response.status,
        error: errorText || response.statusText
      };
    }

    return {
      ok: true,
      status: response.status
    };
  } catch (error) {
    console.error("Make webhook fetch error:", error);
    return {
      ok: false,
      error: error.message
    };
  }
}

function triggerMakeWebhook(eventType, payload = {}) {
  return sendToMakeWebhook({
    event: eventType,
    source: "hob-crm",
    timestamp: new Date().toISOString(),
    ...payload
  });
}

async function sendLeadToMake(lead) {
  if (!lead) return false;

  const result = await triggerMakeWebhook("lead_created_or_updated", {
    lead: {
      id: lead.id || null,
      name: lead.name || "",
      phone: normalizePhone(lead.phone || ""),
      loc: lead.loc || "",
      source: lead.source || "crm",
      status: lead.status || "",
      stage: lead.stage || "",
      updatedAt: lead.updatedAt || Date.now()
    }
  });

  if (!result.ok) {
    console.error("Lead payload failed to reach Make.com:", result);
    return false;
  }

  return true;
}

async function sendReplyToMake(leadId, phone, text) {
  if (!leadId || !phone || !text || !text.trim()) return false;

  const payload = {
    event: "whatsapp_outbound",
    source: "hob-crm",
    timestamp: new Date().toISOString(),
    leadId,
    phone: normalizePhone(phone),
    message: text.trim(),
    channel: "whatsapp",
    sentBy: "agent",
    status: "queued"
  };

  const result = await triggerMakeWebhook("whatsapp_outbound", payload);

  if (!result.ok) {
    console.error("Reply payload failed to reach Make.com:", result);
    return false;
  }

  return true;
}

// Safe API helper (generic fetch wrapper with response.ok checks)
async function api(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const payload = options.body;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Request failed (${response.status}): ${errorText || response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

// Lead object parser: robust against malformed Firestore payloads
function parseLeadDoc(doc) {
  const data = doc && doc.data ? doc.data() : {};
  let lead = {};

  if (data.j && typeof data.j === "string") {
    try {
      lead = JSON.parse(data.j);
    } catch (e) {
      lead = { ...data };
    }
  } else {
    lead = { ...data };
  }

  if (!lead || typeof lead !== "object") {
    lead = {};
  }

  lead.id = lead.id || doc.id;
  lead.phone = lead.phone || data.phone || lead.ph || "";
  lead.name = lead.name || data.name || lead.nm || "";
  lead.loc = lead.loc || data.loc || "Gurgaon";
  lead.u = lead.u || data.u || Date.now();
  lead.updatedAt = lead.updatedAt || data.updatedAt || Date.now();
  if (!lead.status) lead.status = data.status || "new";
  if (!lead.stage) lead.stage = data.stage || "Inquiries";
  if (!lead.source) lead.source = data.source || "crm";

  return lead;
}

// Main app state sync
function syncToUI(cloudLeads) {
  const targetS = window.S || (typeof S !== "undefined" ? S : null);

  if (targetS) {
    if (!Array.isArray(targetS.leads)) {
      targetS.leads = [];
    }

    // Merge incoming cloud leads into current local list
    const existingMap = new Map(targetS.leads.map((lead) => [lead.id, lead]));
    const merged = [];

    cloudLeads.forEach((lead) => {
      const existingLead = existingMap.get(lead.id);
      if (existingLead) {
        merged.push({ ...existingLead, ...lead });
      } else {
        merged.push({ ...lead });
      }
    });

    targetS.leads = merged;

    if (typeof window.fLoc !== "undefined") window.fLoc = "All";
    else if (typeof fLoc !== "undefined") fLoc = "All";

    if (typeof window.render === "function") window.render();
    else if (typeof render === "function") render();

    return true;
  }

  return false;
}

function renderChatThread(messages) {
  const threadEl = document.getElementById("whatsappThread");
  if (!threadEl) return;

  currentThreadMessages = Array.isArray(messages) ? messages : [];
  threadEl.innerHTML = "";

  currentThreadMessages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = "msg " + (msg.direction === "outbound" ? "me" : "");

    const isOutbound = msg.direction === "outbound";
    const author = isOutbound ? "You" : (msg.from || "Customer");
    const time = new Date(msg.timestamp || Date.now()).toLocaleString();

    row.innerHTML = `
      <div class="msgln">
        <strong>${author}</strong>
        <small>${time}</small>
      </div>
      <div>${(msg.body || "").replace(/\n/g, "<br>")}</div>
    `;

    threadEl.appendChild(row);
  });

  if (threadEl.scrollTop) {
    threadEl.scrollTop = threadEl.scrollHeight;
  }
}

function watchLeadThread(leadId) {
  if (!leadId) return;

  if (threadUnsubscribe) {
    threadUnsubscribe();
    threadUnsubscribe = null;
  }

  const threadRef = collection(db, "hob_leads", leadId, "whatsapp_messages");
  threadUnsubscribe = onSnapshot(
    threadRef,
    (snapshot) => {
      const messages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      renderChatThread(messages);
    },
    (error) => {
      console.error("WhatsApp thread snapshot failed:", error);
    }
  );
}

function openLeadChat(leadId) {
  activeLeadId = leadId;
  watchLeadThread(leadId);

  const panel = document.getElementById("whatsappChatPanel");
  if (panel) panel.style.display = "block";
}

async function sendReplyFromCRM() {
  if (!activeLeadId) return;

  const input = document.getElementById("whatsappReplyInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  const lead = window.S && Array.isArray(window.S.leads)
    ? window.S.leads.find((l) => l.id === activeLeadId)
    : null;

  if (!lead) return;

  const optimisticMessage = {
    id: `temp_${Date.now()}`,
    leadId: activeLeadId,
    from: "+919900000000",
    to: normalizePhone(lead.phone || ""),
    body: text,
    direction: "outbound",
    status: "pending",
    timestamp: Date.now(),
    provider: "whatsapp"
  };

  const updatedThread = [...(currentThreadMessages || []), optimisticMessage];
  renderChatThread(updatedThread);

  input.value = "";
  input.disabled = true;

  const ok = await sendReplyToMake(activeLeadId, lead.phone || "", text);

  input.disabled = false;

  if (!ok) {
    console.error("Reply could not be sent to Make.com");
    return;
  }

  // The real message will be written back by Make/Firestore and then
  // the onSnapshot listener will update the thread.
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#sendReplyBtn")) {
    sendReplyFromCRM();
  }
});

async function initLeadsSync() {
  try {
    const colRef = collection(db, "hob_leads");

    // Initial fetch
    const snap = await getDocs(colRef);
    const cloudLeads = [];

    snap.forEach((d) => {
      const lead = parseLeadDoc(d);
      cloudLeads.push(lead);
    });

    // Try to apply initial leads to the app state
    let attempts = 0;
    const checker = setInterval(() => {
      attempts++;
      if (syncToUI(cloudLeads) || attempts > 30) {
        clearInterval(checker);
      }
    }, 150);

    // Real-time updates
    onSnapshot(
      colRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const lead = parseLeadDoc(change.doc);

          if (change.type === "removed") {
            const targetS = window.S || (typeof S !== "undefined" ? S : null);
            if (targetS && Array.isArray(targetS.leads)) {
              targetS.leads = targetS.leads.filter((l) => l.id !== lead.id);
              if (typeof window.render === "function") window.render();
              else if (typeof render === "function") render();
            }
            return;
          }

          if (change.type === "added" || change.type === "modified") {
            const targetS = window.S || (typeof S !== "undefined" ? S : null);

            if (targetS && Array.isArray(targetS.leads)) {
              const idx = targetS.leads.findIndex((l) => l.id === lead.id);
              if (idx >= 0) {
                targetS.leads[idx] = { ...targetS.leads[idx], ...lead };
              } else {
                targetS.leads.unshift(lead);
              }
            } else if (targetS) {
              targetS.leads = [lead];
            }

            if (typeof window.render === "function") window.render();
            else if (typeof render === "function") render();
          }
        });
      },
      (error) => {
        console.error("Firestore lead sync error:", error);
      }
    );

    console.log("Firestore permanent auto-sync active!");
  } catch (err) {
    console.error("Firestore sync error:", err);
  }
}

// Startup
initLeadsSync();

window.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("whatsappReplyInput")) {
    document.getElementById("whatsappReplyInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendReplyFromCRM();
      }
    });
  }
});
