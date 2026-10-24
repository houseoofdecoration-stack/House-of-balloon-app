import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
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

try {
  const colRef = collection(db, "hob_leads");
  onSnapshot(colRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const docData = change.doc.data();
      let leadObj = {};

      if (docData.j && typeof docData.j === "string") {
        try {
          leadObj = JSON.parse(docData.j);
        } catch (e) {
          leadObj = { ...docData };
        }
      } else {
        leadObj = { ...docData };
      }

      leadObj.id = leadObj.id || change.doc.id;
      leadObj.u = docData.u || leadObj.u || Date.now();

      if (!leadObj.loc) leadObj.loc = "Gurgaon";

      if (window.S && Array.isArray(window.S.leads)) {
        const idx = window.S.leads.findIndex(l => l.id === leadObj.id);
        if (idx >= 0) {
          window.S.leads[idx] = { ...window.S.leads[idx], ...leadObj };
        } else {
          window.S.leads.unshift(leadObj);
        }

        if (typeof window.fLoc !== "undefined") window.fLoc = "All";
        if (typeof window.render === "function") window.render();
      }
    });
  });
  console.log("Firestore hob_leads parsed listener active!");
} catch (e) {
  console.error("Firestore listener error:", e);
}
