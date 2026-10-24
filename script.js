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

async function initLeadsSync() {
  try {
    const colRef = collection(db, "hob_leads");
    const snap = await getDocs(colRef);
    const cloudLeads = [];
    snap.forEach(d => cloudLeads.push(parseLeadDoc(d)));
    
    if (window.S) {
      window.S.leads = cloudLeads;
      if (typeof window.fLoc !== "undefined") window.fLoc = "All";
      if (typeof window.render === "function") window.render();
    }

    onSnapshot(colRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const lead = parseLeadDoc(change.doc);
          if (window.S && Array.isArray(window.S.leads)) {
            const idx = window.S.leads.findIndex(l => l.id === lead.id);
            if (idx >= 0) {
              window.S.leads[idx] = { ...window.S.leads[idx], ...lead };
            } else {
              window.S.leads.unshift(lead);
            }
            if (typeof window.render === "function") window.render();
          }
        }
      });
    });
    
    console.log("Firebase sync fully operational!");
  } catch (err) {
    console.error("Firestore sync error:", err);
  }
}

initLeadsSync();
