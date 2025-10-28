// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAQcqTo-sWcgVTiXd84eBeeeDKTo7R_A10",
  authDomain: "apptuadmin.firebaseapp.com",
  projectId: "apptuadmin",
  storageBucket: "apptuadmin.appspot.com",
  messagingSenderId: "115288218019",
  appId: "1:115288218019:web:ed4bd28f251649a332e216",
  measurementId: "G-K4VQESPXRL"
};

export const appId = "apptuadmin"; // digunakan untuk path Firestore

// Inisialisasi Firebase
export const app = initializeApp(firebaseConfig);

// Opsional — hanya bila Analytics diaktifkan di Firebase Console
export const analytics = getAnalytics(app);

// Instance Auth & Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Path koleksi absensi
export const getCollectionPath = () => `/artifacts/${appId}/public/data/absensi`;
