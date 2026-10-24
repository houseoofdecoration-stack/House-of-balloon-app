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

// लीड ऑब्जेक्ट पार्स करने का हेल्पर
function parseLeadDoc(doc) {
  const data = doc.data();
  let l = {};
  if (data.j && typeof data.j === "string") {
    try { l = JSON.parse(data.j); } catch(e) { l = { ...data }; }
  } else {
    l = { ...data };
  }
  l.id = l.id || doc.id;
  l.u = data.u || l.u || Date.now();
  if (!l.loc) l.loc = "Gurgaon";
  return l;
}

// मुख्य ऐप स्टेट में लीड्स अपडेट करने का फंक्शन
function syncToUI(cloudLeads) {
  const targetS = window.S || (typeof S !== "undefined" ? S : null);
  if (targetS) {
    targetS.leads = cloudLeads;
    if (typeof window.fLoc !== "undefined") window.fLoc = "All";
    else if (typeof fLoc !== "undefined") fLoc = "All";
    
    if (typeof window.render === "function") window.render();
    else if (typeof render === "function") render();
    return true;
  }
  return false;
}

async function initLeadsSync() {
  try {
    const colRef = collection(db, "hob_leads");
    
    // 1. ऐप लोड होते ही Firestore से सभी लीड्स लोड करें
    const snap = await getDocs(colRef);
    const cloudLeads = [];
    snap.forEach(d => cloudLeads.push(parseLeadDoc(d)));
    
    // मुख्य ऐप स्टेट तैयार होने का इंतज़ार करके डेटा सेट करें
    let attempts = 0;
    const checker = setInterval(() => {
      attempts++;
      if (syncToUI(cloudLeads) || attempts > 30) {
        clearInterval(checker);
      }
    }, 150);

    // 2. आगे आने वाली हर नई लीड के लिए रियल-टाइम लिस्नर
    onSnapshot(colRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const lead = parseLeadDoc(change.doc);
          const targetS = window.S || (typeof S !== "undefined" ? S : null);
          if (targetS && Array.isArray(targetS.leads)) {
            const idx = targetS.leads.findIndex(l => l.id === lead.id);
            if (idx >= 0) {
              targetS.leads[idx] = { ...targetS.leads[idx], ...lead };
            } else {
              targetS.leads.unshift(lead);
            }
            if (typeof window.render === "function") window.render();
            else if (typeof render === "function") render();
          }
        }
      });
    });
    
    console.log("Firestore permanent auto-sync active!");
  } catch (err) {
    console.error("Firestore sync error:", err);
  }
}

initLeadsSync();
