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

function docIdFromLead(leadData) {
  const phone = getDisplayLeadValue(leadData, "phone", "mobile", "number", "phoneNumber", "whatsapp");
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `p${digits}`;
}

// The app UI already owns native chat rendering in index.html.
// This file must not inject custom HTML, inline styles, or alternate chat hosts.
window.chatInbox = {
  render: () => {},
  open: () => {},
  show: () => {},
  hide: () => {}
};

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

window.saveLeadToCloud = saveLeadToFirestore;
window.saveLeadToFirestore = saveLeadToFirestore;

window.loadLeadsFromCloud = loadAllLeadsFromFirestore;
window.loadAllLeadsFromFirestore = loadAllLeadsFromFirestore;

window.listenToCloudSync = listenToLeads;
window.listenToLeads = listenToLeads;

window.getLeadByPhoneFromCloud = getLeadByPhoneFromFirestore;
window.getLeadByPhoneFromFirestore = getLeadByPhoneFromFirestore;

window.addEventListener("load", () => {
  // Intentionally empty: native app UI controls the Chats tab and chat threads.
});

export {
  saveLeadToFirestore,
  loadAllLeadsFromFirestore,
  getLeadByPhoneFromFirestore,
  listenToLeads,
  normalizeLeadForDefaultStage,
  getLeadListEntries,
  getLeadLatestMessage,
  getLeadLatestTimestamp,
  formatChatTimestamp,
  getLeadRecordName,
  getLeadRecordPhone
};
