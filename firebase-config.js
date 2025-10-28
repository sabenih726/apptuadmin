// firebase-config.js
// ⚠️ PASTIKAN FILE INI DI ROOT FOLDER (sejajar dengan index.html)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAQcqTo-sWcgVTiXd84eBeeeDKTo7R_A10",
  authDomain: "apptuadmin.firebaseapp.com",
  projectId: "apptuadmin",  // ⚠️ PASTIKAN INI TERISI!
  storageBucket: "apptuadmin.appspot.com",
  messagingSenderId: "115288218019",
  appId: "1:115288218019:web:ed4bd28f251649a332e216",
  measurementId: "G-K4VQESPXRL"
};

// Debug: Log config untuk memastikan terload
console.log('Firebase Config:', firebaseConfig);
console.log('Project ID:', firebaseConfig.projectId);

// Initialize Firebase
let app;
let auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
}

// Export
export { app, auth, db, firebaseConfig };

// Helper function
export const getCollectionPath = () => 'attendance';
