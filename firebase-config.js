// firebase-config.js
console.log('🔥 Loading firebase-config.js...');

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ========================================
// FIREBASE CONFIGURATION
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
// ENVIRONMENT DETECTION
// ========================================
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

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

validateConfig(firebaseConfig);

// ========================================
// INITIALIZE FIREBASE
// ========================================
let app, auth, db;

try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase App initialized');
  
  auth = getAuth(app);
  console.log('✅ Firebase Auth initialized');
  
  db = getFirestore(app);
  console.log('✅ Firestore initialized');
  
  console.log(`✅ Firebase fully initialized (${firebaseConfig.projectId})`);
  
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  throw error;
}

// ========================================
// COLLECTION NAMES
// ========================================
const COLLECTIONS = {
  ATTENDANCE: 'attendance',
  EMPLOYEES: 'karyawan',
  USERS: 'users',
  SETTINGS: 'settings',
  LOGS: 'logs'
};

// ========================================
// USER ROLES
// ========================================
const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor'
};

console.log('📋 Collections:', COLLECTIONS);
console.log('👥 Roles:', ROLES);

// ========================================
// ROLE MANAGEMENT FUNCTIONS
// ========================================

/**
 * Get user role from Firestore
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} User role or null
 */
export async function getUserRole(userId) {
  try {
    if (!userId) {
      console.warn('⚠️ getUserRole: No userId provided');
      return null;
    }
    
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, userId));
    
    if (!userDoc.exists()) {
      console.warn('⚠️ User document not found for:', userId);
      return null;
    }
    
    const userData = userDoc.data();
    return userData.role || null;
    
  } catch (error) {
    console.error('❌ Error getting user role:', error);
    return null;
  }
}

/**
 * Check if user is admin
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
  const role = await getUserRole(userId);
  return role === ROLES.ADMIN;
}

/**
 * Check if user has specific role
 * @param {string} userId - User ID
 * @param {string} requiredRole - Required role
 * @returns {Promise<boolean>}
 */
export async function hasRole(userId, requiredRole) {
  const role = await getUserRole(userId);
  return role === requiredRole;
}

/**
 * Get current user
 * @returns {Promise<object|null>}
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Get current user with role
 * @returns {Promise<object|null>}
 */
export async function getCurrentUserWithRole() {
  const user = await getCurrentUser();
  
  if (!user) return null;
  
  const role = await getUserRole(user.uid);
  
  return {
    ...user,
    role: role,
    isAdmin: role === ROLES.ADMIN
  };
}

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
 * Get all role names
 * @returns {object} All role names
 */
export function getRoles() {
  return ROLES;
}

/**
 * Check if Firebase is initialized
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
  return !!(app && auth && db);
}

/**
 * Get Firebase configuration info (safe, no sensitive data)
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

// ========================================
// EXPORTS
// ========================================
export { 
  app, 
  auth, 
  db, 
  firebaseConfig,
  isDevelopment,
  COLLECTIONS,
  ROLES  // ✅ Make sure ROLES is exported
};

// ========================================
// GLOBAL EXPOSURE (Optional - for legacy code)
// ========================================
if (typeof window !== 'undefined') {
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDB = db;
  window.firebaseConfig = firebaseConfig;
  window.COLLECTIONS = COLLECTIONS;
  window.ROLES = ROLES;
  console.log('✅ Firebase exposed to window object');
}

// ========================================
// STARTUP LOG
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔥 Firebase Configuration Ready');
console.log('Project:', firebaseConfig.projectId);
console.log('Environment:', isDevelopment ? '🔧 Development' : '🚀 Production');
console.log('Auth:', auth ? '✅' : '❌');
console.log('Firestore:', db ? '✅' : '❌');
console.log('Collections:', Object.keys(COLLECTIONS).join(', '));
console.log('Roles:', Object.keys(ROLES).join(', '));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
