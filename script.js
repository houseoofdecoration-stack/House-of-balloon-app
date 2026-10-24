import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  serverTimestamp, 
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// विंडो पर सेट करें ताकि मुख्य ऐप इसे सीधे पढ़ सके
window.firebaseApp = app;
window.db = db;

// hob_leads कलेक्शन का रियल-टाइम लिस्नर
try {
  const q = collection(db, "hob_leads");
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = change.doc.data();
      const lead = { id: change.doc.id, ...data };
      
      if (typeof window.onCloudLead === "function") {
        window.onCloudLead(lead);
      } else if (window.S && Array.isArray(window.S.leads)) {
        const idx = window.S.leads.findIndex(l => l.id === lead.id);
        if (idx >= 0) {
          window.S.leads[idx] = { ...window.S.leads[idx], ...lead };
        } else {
          window.S.leads.unshift(lead);
        }
        if (typeof window.render === "function") {
          window.render();
        }
      }
    });
  }, (err) => {
    console.error("Firestore snapshot error:", err);
  });
  console.log("Firestore hob_leads listener attached successfully!");
} catch (e) {
  console.error("Failed to attach Firestore listener:", e);
}
