// Firebase SDK Modules Import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration Keys
const firebaseConfig = {
  apiKey: "AIzaSyDmHZw0NogvE9CClsbWUngRROFXoVRB_aM",
  authDomain: "house-of-balloon-crm.firebaseapp.com",
  projectId: "house-of-balloon-crm",
  storageBucket: "house-of-balloon-crm.firebasestorage.app",
  messagingSenderId: "38190937524",
  appId: "1:38190937524:web:2e89c3e7c1f13863c12ee1"
};

// Initialize Firebase & Cloud Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. Function to Save Lead to Cloud Server
async function saveLeadToCloud(leadData) {
  try {
    const docRef = await addDoc(collection(db, "leads"), {
      ...leadData,
      createdAt: serverTimestamp()
    });
    console.log("Lead saved with Cloud ID: ", docRef.id);
    alert("लीड गूगल क्लाउड पर सेव हो गई है!");
  } catch (error) {
    console.error("Error saving lead: ", error);
    alert("त्रुटि: " + error.message);
  }
}

// 2. Function to Fetch Leads from Cloud Server
async function loadLeadsFromCloud() {
  try {
    const querySnapshot = await getDocs(collection(db, "leads"));
    const leads = [];
    querySnapshot.forEach((doc) => {
      leads.push({ id: doc.id, ...doc.data() });
    });
    return leads;
  } catch (error) {
    console.error("Error fetching leads: ", error);
  }
}
