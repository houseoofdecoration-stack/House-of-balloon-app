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

function safeParseLeadJson(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === "string") {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return null;
    }
  }
  if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue;
  }
  return null;
}

function normalizeLeadForDefaultStage(leadData) {
  const baseLead = safeParseLeadJson(leadData) || (leadData && typeof leadData === "object" ? leadData : {});
  const nextLead = { ...baseLead };

  if (!nextLead.stage && !nextLead.pipeline && !nextLead.pipe) {
    nextLead.stage = "Today Leads";
    nextLead.pipeline = "Today Leads";
  } else if (!nextLead.pipeline && (nextLead.stage || nextLead.pipe)) {
    nextLead.pipeline = nextLead.stage || nextLead.pipe;
  } else if (!nextLead.stage && (nextLead.pipeline || nextLead.pipe)) {
    nextLead.stage = nextLead.pipeline || nextLead.pipe;
  }

  if (!nextLead.status && (nextLead.stage || nextLead.pipeline)) {
    nextLead.status = nextLead.stage || nextLead.pipeline;
  }

  return nextLead;
}

function getDisplayLeadValue(lead, fallbackKey, ...candidates) {
  for (const key of candidates) {
    const value = lead && lead[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  if (fallbackKey && lead && lead[fallbackKey] !== undefined && lead[fallbackKey] !== null) {
    return lead[fallbackKey];
  }
  return "";
}

function getLeadLatestMessage(lead) {
  if (!lead || typeof lead !== "object") return "No messages yet";

  const messageLists = [
    lead.messages,
    lead.chat,
    lead.conversation,
    lead.chats,
    lead.conversations,
    lead.recentMessages,
    lead.messageThreads
  ];

  for (const list of messageLists) {
    if (!Array.isArray(list) || !list.length) continue;
    const lastMessage = [...list].reverse().find((item) => {
      if (!item || typeof item !== "object") return false;
      const text = getDisplayLeadValue(item, "text", "message", "body", "content", "snippet");
      return String(text || "").trim() !== "";
    });

    if (lastMessage) {
      const text = getDisplayLeadValue(lastMessage, "text", "message", "body", "content", "snippet");
      if (String(text || "").trim()) return String(text).trim();
    }

    const fallbackText = getDisplayLeadValue(list[list.length - 1], "text", "message", "body", "content", "snippet");
    if (String(fallbackText || "").trim()) return String(fallbackText).trim();
  }

  const recentText = getDisplayLeadValue(lead, "lastMessage", "latestMessage", "lastText", "message", "body", "notes");
  if (String(recentText || "").trim()) return String(recentText).trim();

  return "No messages yet";
}

function getLeadLatestTimestamp(lead) {
  if (!lead || typeof lead !== "object") return 0;

  const messageLists = [
    lead.messages,
    lead.chat,
    lead.conversation,
    lead.chats,
    lead.conversations,
    lead.recentMessages,
    lead.messageThreads
  ];

  let latestTs = 0;

  for (const list of messageLists) {
    if (!Array.isArray(list)) continue;
    list.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const candidate = getDisplayLeadValue(item, "ts", "time", "timestamp", "createdAt", "updatedAt", "date");
      const value = Number(candidate);
      if (Number.isFinite(value)) {
        latestTs = Math.max(latestTs, value);
      } else if (candidate && !Number.isNaN(Date.parse(candidate))) {
        latestTs = Math.max(latestTs, Date.parse(candidate));
      }
    });
  }

  const fallbackStamp = getDisplayLeadValue(lead, "updatedAt", "ts", "lastMessageAt", "lastUpdated", "time");
  const numeric = Number(fallbackStamp);
  if (Number.isFinite(numeric)) {
    latestTs = Math.max(latestTs, numeric);
  } else if (fallbackStamp && !Number.isNaN(Date.parse(fallbackStamp))) {
    latestTs = Math.max(latestTs, Date.parse(fallbackStamp));
  }

  return latestTs;
}

function formatChatTimestamp(rawTs) {
  if (!rawTs) return "Just now";
  const value = Number(rawTs);
  const parsed = Number.isFinite(value) ? new Date(value) : new Date(rawTs);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return parsed.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function getLeadRecordName(lead, fallbackPhone) {
  const name = getDisplayLeadValue(lead, "name", "customerName", "fullName", "leadName", "firstName");
  if (String(name || "").trim()) {
    return String(name).trim();
  }

  const first = getDisplayLeadValue(lead, "firstName", "fname");
  const last = getDisplayLeadValue(lead, "lastName", "lname");
  if (String(first || "").trim() || String(last || "").trim()) {
    return `${String(first || "").trim()} ${String(last || "").trim()}`.trim();
  }

  return fallbackPhone || "Customer";
}

function getLeadRecordPhone(lead, fallbackDocId) {
  const phone = getDisplayLeadValue(lead, "phone", "mobile", "number", "phoneNumber", "whatsapp");
  if (String(phone || "").trim()) return String(phone).trim();
  if (fallbackDocId) return String(fallbackDocId).replace(/^p/, "");
  return "No phone";
}

function getLeadListEntries(snapshot) {
  const entries = [];
  snapshot.forEach((docSnap) => {
    const leadData = docSnap.data();
    const parsedLead = safeParseLeadJson(leadData && leadData.j) || (leadData && typeof leadData === "object" ? leadData : {});
    if (!parsedLead || typeof parsedLead !== "object") return;

    const lead = { ...parsedLead, id: docSnap.id };
    const phone = getLeadRecordPhone(lead, docSnap.id);
    const name = getLeadRecordName(lead, phone);
    const latestMessage = getLeadLatestMessage(lead);
    const latestTs = getLeadLatestTimestamp(lead);

    entries.push({
      id: docSnap.id,
      name,
      phone,
      payload: lead,
      message: latestMessage,
      timestamp: latestTs
    });
  });
  return entries.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
}

function ensureChatInboxHost() {
  let host = document.getElementById("chatInboxHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "chatInboxHost";
  host.setAttribute("aria-live", "polite");
  host.style.display = "none";
  host.style.maxWidth = "520px";
  host.style.margin = "0 auto";
  host.style.padding = "10px 16px 110px";
  host.style.background = "var(--bg, #F2F6F3)";
  host.style.color = "var(--ink, #0E2A1F)";
  host.style.fontFamily = "Bricolage Grotesque, Noto Sans Devanagari, system-ui, sans-serif";
  host.style.minHeight = "100vh";
  host.innerHTML = `
    <div data-role="chat-list-view" style="display:block;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 2px 12px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--mute,#5B7468);font-weight:700;">Inbox</div>
          <div style="font-size:26px;font-weight:800;line-height:1.1;">Chats</div>
        </div>
      </div>
      <div data-role="chat-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>
    <div data-role="chat-thread-view" style="display:none;">
      <div data-role="chat-thread-header" style="display:flex;align-items:center;gap:10px;padding:8px 0 14px;border-bottom:1px solid var(--line,#DCE6DF);margin-bottom:12px;"></div>
      <div data-role="chat-thread-messages" style="display:flex;flex-direction:column;gap:8px;min-height:220px;"></div>
      <div style="margin-top:14px;border-top:1px solid var(--line,#DCE6DF);padding-top:12px;display:flex;gap:8px;align-items:center;">
        <input data-role="chat-input" type="text" placeholder="Type a message" style="flex:1;min-width:0;padding:12px 14px;border:1px solid var(--line,#DCE6DF);border-radius:18px;background:var(--card,#fff);color:var(--ink,#0E2A1F);font:inherit;" />
        <button data-action="chat-send" style="border:0;border-radius:18px;background:var(--pri,#0F5A3F);color:var(--onpri,#fff);padding:12px 16px;font-weight:700;cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  const app = document.getElementById("app");
  if (app && app.parentNode) {
    app.parentNode.insertBefore(host, app.nextSibling);
  } else {
    document.body.appendChild(host);
  }

  return host;
}

function renderChatInboxList() {
  const host = ensureChatInboxHost();
  const listEl = host.querySelector("[data-role='chat-list']");
  if (!listEl) return;

  listEl.innerHTML = "<div style='color:var(--mute,#5B7468);padding:10px 0;'>Loading chats…</div>";

  getDocs(leadsCol)
    .then((snapshot) => {
      const entries = getLeadListEntries(snapshot);
      if (!entries.length) {
        listEl.innerHTML = "<div style='padding:16px 12px;border:1px dashed var(--line,#DCE6DF);border-radius:16px;color:var(--mute,#5B7468);background:var(--card,#fff);'>No chats yet.</div>";
        return;
      }

      listEl.innerHTML = entries.map((entry) => {
        const safeName = String(entry.name || "Customer").replace(/[<>]/g, "");
        const safePhone = String(entry.phone || "No phone").replace(/[<>]/g, "");
        const safeMessage = String(entry.message || "No messages yet").replace(/[<>]/g, "");
        const safeTs = formatChatTimestamp(entry.timestamp);
        return `
          <button data-chat-lead='${encodeURIComponent(JSON.stringify(entry.payload || {}))}' data-chat-id='${entry.id}' style="display:flex;align-items:flex-start;gap:12px;width:100%;border:1px solid var(--line,#DCE6DF);background:var(--card,#fff);padding:12px;border-radius:18px;text-align:left;cursor:pointer;box-shadow:0 1px 0 rgba(12, 24, 18, 0.04);">
            <div style="flex:none;width:52px;height:52px;border-radius:16px;background:var(--soft,#E3EFE8);display:grid;place-items:center;font-weight:800;color:var(--pri,#0F5A3F);">${String(safeName).charAt(0).toUpperCase() || "C"}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <b style="display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeName}</b>
                <span style="font-size:11px;color:var(--mute,#5B7468);white-space:nowrap;">${safeTs}</span>
              </div>
              <div style="font-size:12px;color:var(--mute,#5B7468);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safePhone}</div>
              <div style="font-size:13px;color:var(--ink,#0E2A1F);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeMessage}</div>
            </div>
          </button>
        `;
      }).join("");

      listEl.querySelectorAll("[data-chat-lead]").forEach((button) => {
        button.addEventListener("click", () => {
          const rawLead = button.getAttribute("data-chat-lead");
          if (!rawLead) return;
          try {
            const decodedLead = JSON.parse(decodeURIComponent(rawLead));
            if (decodedLead) openChatThread(decodedLead, button.getAttribute("data-chat-id"));
          } catch (error) {
            console.warn("Failed to open chat item:", error);
          }
        });
      });
    })
    .catch((error) => {
      console.error("Chat Inbox Load Error:", error);
      listEl.innerHTML = "<div style='padding:14px 12px;border:1px solid var(--line,#DCE6DF);border-radius:16px;background:var(--card,#fff);color:var(--mute,#5B7468);'>Unable to load chats right now.</div>";
    });
}

function openChatThread(leadPayload, leadId) {
  const host = ensureChatInboxHost();
  const listView = host.querySelector("[data-role='chat-list-view']");
  const threadView = host.querySelector("[data-role='chat-thread-view']");
  const header = host.querySelector("[data-role='chat-thread-header']");
  const messageWrap = host.querySelector("[data-role='chat-thread-messages']");
  const input = host.querySelector("[data-role='chat-input']");
  const sendBtn = host.querySelector("[data-action='chat-send']");

  if (!listView || !threadView || !header || !messageWrap || !input || !sendBtn) return;

  const lead = leadPayload && typeof leadPayload === "object" ? { ...leadPayload, id: leadId || leadPayload.id } : { id: leadId || "" };
  const customerName = getLeadRecordName(lead, getLeadRecordPhone(lead, leadId));
  const customerPhone = getLeadRecordPhone(lead, leadId);
  const messages = Array.isArray(lead.messages) ? lead.messages : Array.isArray(lead.chat) ? lead.chat : [];

  header.innerHTML = `
    <button data-action="chat-back" aria-label="Back" style="border:0;background:var(--soft,#E3EFE8);color:var(--ink,#0E2A1F);padding:8px 11px;border-radius:12px;cursor:pointer;font-size:20px;line-height:1;">←</button>
    <div style="flex:1;min-width:0;">
      <div style="font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${String(customerName).replace(/[<>]/g, "")}</div>
      <div style="font-size:12px;color:var(--mute,#5B7468);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${String(customerPhone).replace(/[<>]/g, "")}</div>
    </div>
  `;

  host.querySelector("[data-action='chat-back']").addEventListener("click", () => {
    listView.style.display = "block";
    threadView.style.display = "none";
  });

  const messageHtml = messages.length
    ? messages.map((message) => {
        const isMe = message && message.from && String(message.from).toLowerCase() === "me";
        const text = (message && (message.text || message.message || message.body || message.content || message.snippet)) || "";
        const time = message && (message.ts || message.time || message.timestamp || message.createdAt || message.updatedAt);
        return `
          <div style="display:flex;${isMe ? "justify-content:flex-end" : "justify-content:flex-start"};">
            <div style="max-width:82%;padding:10px 12px;border-radius:16px;background:${isMe ? "var(--pri,#0F5A3F)" : "var(--card,#fff)"};color:${isMe ? "var(--onpri,#fff)" : "var(--ink,#0E2A1F)"};border:1px solid var(--line,#DCE6DF);">
              <div style="white-space:pre-wrap;word-break:break-word;">${String(text || "").replace(/[<>]/g, "") || "No message"}</div>
              <small style="display:block;margin-top:4px;opacity:0.7;font-size:11px;">${formatChatTimestamp(time)}</small>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="padding:16px 12px;text-align:center;color:var(--mute,#5B7468);border:1px dashed var(--line,#DCE6DF);border-radius:16px;background:var(--card,#fff);">No messages yet</div>`;

  messageWrap.innerHTML = messageHtml;
  listView.style.display = "none";
  threadView.style.display = "block";
  input.value = "";

  sendBtn.onclick = () => {
    const typed = String(input.value || "").trim();
    if (!typed) return;
    const messageToPush = {
      from: "me",
      text: typed,
      ts: Date.now(),
      createdAt: Date.now()
    };
    if (!Array.isArray(lead.messages)) lead.messages = [];
    lead.messages.push(messageToPush);
    messageWrap.insertAdjacentHTML("beforeend", `
      <div style="display:flex;justify-content:flex-end;">
        <div style="max-width:82%;padding:10px 12px;border-radius:16px;background:var(--pri,#0F5A3F);color:var(--onpri,#fff);border:1px solid var(--line,#DCE6DF);">
          <div style="white-space:pre-wrap;word-break:break-word;">${typed.replace(/[<>]/g, "")}</div>
          <small style="display:block;margin-top:4px;opacity:0.7;font-size:11px;">${formatChatTimestamp(Date.now())}</small>
        </div>
      </div>
    `);
    input.value = "";
    const payload = normalizeLeadForDefaultStage(lead);
    if (leadId) {
      setDoc(doc(db, "hob_leads", leadId), { j: JSON.stringify(payload), u: Date.now() }).catch((error) => {
        console.error("Chat message save error:", error);
      });
    }
  };
}

function bindChatTabToggles() {
  const tabButtons = document.querySelectorAll('[data-a="tab"][data-t], button[data-t]');
  tabButtons.forEach((button) => {
    const tabName = button.getAttribute("data-t") || button.getAttribute("data-tab");
    if (!tabName) return;

    button.onclick = (event) => {
      const app = document.getElementById("app");
      const chatHost = ensureChatInboxHost();
      const isChatTab = tabName === "chats";

      if (app) {
        app.style.display = isChatTab ? "none" : "block";
      }

      if (chatHost) {
        chatHost.style.display = isChatTab ? "block" : "none";
      }

      if (isChatTab) {
        renderChatInboxList();
      }

      const navButtons = document.querySelectorAll('[data-a="tab"], button[data-t]');
      navButtons.forEach((navButton) => {
        const navName = navButton.getAttribute("data-t") || navButton.getAttribute("data-tab");
        if (navName === tabName) {
          navButton.classList.add("on");
        } else {
          navButton.classList.remove("on");
        }
      });

      if (typeof event === "object") event.preventDefault();
    };
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    bindChatTabToggles();
  });
} else {
  bindChatTabToggles();
}

// 1. क्लाउड में लीड सेव करने के लिए (Strict Schema: j और u)
async function saveLeadToFirestore(leadData) {
  try {
    const incomingLead = leadData && typeof leadData === "object" ? leadData : {};
    const id = docIdFromLead(incomingLead);
    if (!id) {
      console.warn("Invalid lead phone for Firestore doc ID:", leadData);
      return null;
    }

    let existingLead = {};
    try {
      const existingSnap = await getDoc(doc(db, "hob_leads", id));
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        existingLead = safeParseLeadJson(existingData && existingData.j) || {};
      }
    } catch (error) {
      console.warn("Could not read existing doc before save:", error);
    }

    const mergedLead = { ...existingLead, ...incomingLead };
    const normalizedLead = normalizeLeadForDefaultStage(mergedLead);
    const payload = {
      j: JSON.stringify(normalizedLead),
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
      const parsedLead = safeParseLeadJson(data && data.j) || {};
      if (!parsedLead || typeof parsedLead !== "object") return;
      leads.push({ ...parsedLead, id: docSnap.id });
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
    const parsedLead = safeParseLeadJson(data && data.j);
    if (!parsedLead || typeof parsedLead !== "object") return null;

    return { ...parsedLead, id: snap.id };
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
      const parsedLead = safeParseLeadJson(data && data.j) || {};
      if (!parsedLead || typeof parsedLead !== "object") return;
      leads.push({ ...parsedLead, id: docSnap.id });
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

window.chatInbox = {
  render: renderChatInboxList,
  open: openChatThread,
  show: () => {
    const app = document.getElementById("app");
    const host = ensureChatInboxHost();
    if (app) app.style.display = "none";
    if (host) host.style.display = "block";
    renderChatInboxList();
  },
  hide: () => {
    const app = document.getElementById("app");
    const host = document.getElementById("chatInboxHost");
    if (app) app.style.display = "block";
    if (host) host.style.display = "none";
  }
};

window.addEventListener("load", () => {
  const chatHost = ensureChatInboxHost();
  if (chatHost) {
    const app = document.getElementById("app");
    if (app) app.style.display = "block";
    chatHost.style.display = "none";
  }
});
