import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmHZw0NogvE9CC1sbWUngRROFXo...",
  authDomain: "house-of-balloon-crm.firebaseapp.com",
  projectId: "house-of-balloon-crm",
  storageBucket: "house-of-balloon-crm.appspot.com",
  messagingSenderId: "38190937524",
  appId: "1:38190937524:web:2e89c3e7c1f13863..."
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const leadsCol = collection(db, "leads");

// 1. क्लाउड में लीड सेव करने के लिए
window.saveLeadToCloud = async function(leadData) {
  try {
    const docRef = await addDoc(leadsCol, {
      ...leadData,
      createdAt: serverTimestamp()
    });
    console.log("Cloud Save Success ID:", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Cloud Save Error:", e);
  }
};

// 2. क्लाउड से सारा डेटा मंगाने के लिए
window.loadLeadsFromCloud = async function() {
  try {
    const querySnapshot = await getDocs(leadsCol);
    const leads = [];
    querySnapshot.forEach((doc) => {
      leads.push({ id: doc.id, ...doc.data() });
    });
    return leads;
  } catch (e) {
    console.error("Cloud Load Error:", e);
    return [];
  }
};

// 3. लाइव ऑटो-सिंक (ताकि दोनों फोन में तुरंत डेटा दिखे)
window.listenToCloudSync = function(onUpdate) {
  onSnapshot(leadsCol, (snapshot) => {
    const leads = [];
    snapshot.forEach((doc) => {
      leads.push({ id: doc.id, ...doc.data() });
    });
    if (onUpdate) onUpdate(leads);
  });
};
