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
