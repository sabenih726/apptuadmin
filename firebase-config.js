// firebase-config.js
console.log('🔥 Loading firebase-config.js...');

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ========================================
// FIREBASE CONFIGURATION
// ========================================
// ⚠️ CATATAN KEAMANAN:
// - API Key di client-side adalah AMAN untuk Firebase
// - Firebase menggunakan Security Rules untuk proteksi data
// - Pastikan Firestore Rules sudah dikonfigurasi dengan benar
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyAQcqTo-sWcgVTiXd84eBeeeDKTo7R_A10",
  authDomain: "apptuadmin.firebaseapp.com",
  projectId: "apptuadmin",
  storageBucket: "apptuadmin.appspot.com",
  messagingSenderId: "115288218019",
  appId: "1:115288218019:web:ed4bd28f251649a332e216",
  measurementId: "G-K4VQESPXRL"
};

// ========================================
// ENVIRONMENT & DEBUG SETTINGS
// ========================================
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
const isProduction = window.location.hostname.includes('firebaseapp.com') || 
                     window.location.hostname.includes('web.app');

console.log('Environment:', isDevelopment ? 'Development' : 'Production');
console.log('Project ID:', firebaseConfig.projectId);
console.log('Auth Domain:', firebaseConfig.authDomain);

// ========================================
// VALIDATE CONFIGURATION
// ========================================
function validateConfig(config) {
  const requiredFields = [
    'apiKey', 
    'authDomain', 
    'projectId', 
    'storageBucket', 
    'messagingSenderId', 
    'appId'
  ];
  
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    console.error('❌ Missing Firebase config fields:', missingFields);
    throw new Error(`Firebase config incomplete: ${missingFields.join(', ')}`);
  }
  
  console.log('✅ Firebase config validated');
  return true;
}

// Validate before initializing
validateConfig(firebaseConfig);

// ========================================
// INITIALIZE FIREBASE
// ========================================
let app, auth, db;

try {
  // Initialize Firebase App
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase App initialized');
  
  // Initialize Auth
  auth = getAuth(app);
  console.log('✅ Firebase Auth initialized');
  
  // Initialize Firestore
  db = getFirestore(app);
  console.log('✅ Firestore initialized');
  
  // ========================================
  // EMULATOR CONNECTION (untuk development)
  // ========================================
  // Uncomment untuk menggunakan Firebase Emulator
  /*
  if (isDevelopment) {
    console.log('🔧 Connecting to Firebase Emulators...');
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('✅ Connected to Emulators');
  }
  */
  
  console.log(`✅ Firebase fully initialized (${firebaseConfig.projectId})`);
  
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  throw error;
}

// ========================================
// COLLECTION PATHS
// ========================================
const COLLECTIONS = {
  ATTENDANCE: 'attendance',
  EMPLOYEES: 'karyawan',
  USERS: 'users',
  SETTINGS: 'settings',
  LOGS: 'logs'
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get collection path by name
 * @param {string} collectionName - Name of collection
 * @returns {string} Collection path
 */
export function getCollectionPath(collectionName = 'attendance') {
  const path = COLLECTIONS[collectionName.toUpperCase()] || collectionName;
  console.log(`📁 Collection path: ${path}`);
  return path;
}

/**
 * Get all collection names
 * @returns {object} All collection names
 */
export function getCollections() {
  return COLLECTIONS;
}

/**
 * Check if Firebase is initialized
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
  return !!(app && auth && db);
}

/**
 * Get Firebase configuration (without sensitive data)
 * @returns {object} Safe config
 */
export function getFirebaseInfo() {
  return {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    environment: isDevelopment ? 'development' : 'production',
    initialized: isFirebaseInitialized()
  };
}

/**
 * Check current user authentication status
 * @returns {Promise<object|null>} Current user or null
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// ========================================
// EXPORTS
// ========================================
export { 
  app, 
  auth, 
  db, 
  firebaseConfig,
  isDevelopment,
  isProduction,
  COLLECTIONS
};

// Make available globally for legacy code (optional)
if (typeof window !== 'undefined') {
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDB = db;
  window.firebaseConfig = firebaseConfig;
  console.log('✅ Firebase exposed to window object');
}

// ========================================
// STARTUP CHECK
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔥 Firebase Configuration Ready');
console.log('Project:', firebaseConfig.projectId);
console.log('Environment:', isDevelopment ? '🔧 Development' : '🚀 Production');
console.log('Auth:', auth ? '✅' : '❌');
console.log('Firestore:', db ? '✅' : '❌');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
