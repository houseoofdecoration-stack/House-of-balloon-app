import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  onSnapshot
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

function parseLeadDoc(docSnap) {
  if (!docSnap || typeof docSnap.data !== "function") return null;

  const data = docSnap.data() || {};
  let lead = {};

  if (data.j && typeof data.j === "string") {
    try {
      const parsed = JSON.parse(data.j);
      if (parsed && typeof parsed === "object") {
        lead = parsed;
      } else {
        lead = { ...data };
      }
    } catch (e) {
      lead = { ...data };
    }
  } else {
    lead = { ...data };
  }

  lead.id = lead.id || docSnap.id;
  lead.u = lead.u || data.u || Date.now();
  if (!lead.loc) lead.loc = "Gurgaon";
  return lead;
}

function getTargetState() {
  if (typeof window !== "undefined" && window.S) return window.S;
  if (typeof S !== "undefined") return S;
  return null;
}

function mergeCloudLeads(cloudLeads, targetState) {
  if (!Array.isArray(cloudLeads)) {
    return Array.isArray(targetState?.leads) ? [...targetState.leads] : [];
  }

  if (!targetState || !Array.isArray(targetState.leads)) {
    return [...cloudLeads];
  }

  const map = new Map();
  targetState.leads.forEach((lead) => {
    if (lead && lead.id) map.set(String(lead.id), lead);
  });

  cloudLeads.forEach((lead) => {
    if (lead && lead.id) {
      map.set(String(lead.id), { ...(map.get(String(lead.id)) || {}), ...lead });
    }
  });

  return [...map.values()];
}

function syncToUI(cloudLeads) {
  const targetS = getTargetState();
  if (!targetS) return false;

  targetS.leads = mergeCloudLeads(cloudLeads, targetS);

  if (typeof window !== "undefined") {
    if (typeof window.fLoc !== "undefined") window.fLoc = "All";
  } else if (typeof fLoc !== "undefined") {
    fLoc = "All";
  }

  if (typeof window.render === "function") {
    window.render();
    return true;
  }
  if (typeof render === "function") {
    render();
    return true;
  }

  return true;
}

async function initLeadsSync() {
  try {
    const colRef = collection(db, "hob_leads");

    const snap = await getDocs(colRef);
    const cloudLeads = [];

    snap.forEach((docSnap) => {
      try {
        const lead = parseLeadDoc(docSnap);
        if (lead) cloudLeads.push(lead);
      } catch (e) {
        console.warn("Failed to parse Firestore lead:", docSnap && docSnap.id, e);
      }
    });

    let attempts = 0;
    const checker = setInterval(() => {
      attempts++;
      if (syncToUI(cloudLeads) || attempts > 30) {
        clearInterval(checker);
      }
    }, 150);

    onSnapshot(colRef, (snapshot) => {
      const targetS = getTargetState();
      if (!targetS || !Array.isArray(targetS.leads)) return;

      let changed = false;

      snapshot.docChanges().forEach((change) => {
        const id = change && change.doc ? change.doc.id : null;
        if (!id) return;

        if (change.type === "removed") {
          const idx = targetS.leads.findIndex((l) => String(l.id) === String(id));
          if (idx >= 0) {
            targetS.leads.splice(idx, 1);
            changed = true;
          }
          return;
        }

        if (change.type === "added" || change.type === "modified") {
          try {
            const lead = parseLeadDoc(change.doc);
            if (!lead) return;

            const idx = targetS.leads.findIndex((l) => String(l.id) === String(lead.id));
            if (idx >= 0) {
              targetS.leads[idx] = { ...targetS.leads[idx], ...lead };
            } else {
              targetS.leads.unshift(lead);
            }
            changed = true;
          } catch (e) {
            console.warn("Failed to update Firestore lead:", id, e);
          }
        }
      });

      if (changed) {
        if (typeof window.render === "function") window.render();
        else if (typeof render === "function") render();
      }
    });

    console.log("Firestore permanent auto-sync active!");
  } catch (err) {
    console.error("Firestore sync error:", err);
  }
}

initLeadsSync();
