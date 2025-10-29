// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ⚠️ PASTIKAN TIDAK ADA TYPO
const firebaseConfig = {
  apiKey: "AIzaSyAQcqTo-sWcgVTiXd84eBeeeDKTo7R_A10",
  authDomain: "apptuadmin.firebaseapp.com",
  projectId: "apptuadmin",  // ← INI HARUS ADA!
  storageBucket: "apptuadmin.appspot.com",
  messagingSenderId: "115288218019",
  appId: "1:115288218019:web:ed4bd28f251649a332e216",
  measurementId: "G-K4VQESPXRL"
};

// Debug log
console.log('Loading firebase-config.js...');
console.log('Project ID:', firebaseConfig.projectId);

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('✅ Firebase initialized with project:', firebaseConfig.projectId);

// Exports
export { app, auth, db, firebaseConfig };
export const getCollectionPath = () => 'attendance';
