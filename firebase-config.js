// firebase-config.js
console.log('🔥 Loading firebase-config.js...');

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
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
// ✅ AUTO-CREATE USER DOCUMENT (FIXED)
// ========================================

/**
 * Auto-create user document if missing
 * @param {string} userId - User ID
 * @param {object} userData - Optional user data
 * @returns {Promise<string|null>} Created role or null
 */
async function autoCreateUserDocument(userId, userData = {}) {
  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser || currentUser.uid !== userId) {
      console.warn('⚠️ Cannot auto-create: user not authenticated or UID mismatch');
      return null;
    }
    
    console.log('📝 Auto-creating user document for:', userId);
    
    // Determine role based on email
    let role = ROLES.EMPLOYEE; // Default
    const email = currentUser.email || userData.email || '';
    
    // Auto-detect admin from email
    if (email.toLowerCase().includes('admin') || 
        email.toLowerCase().includes('superadmin')) {
      role = ROLES.ADMIN;
      console.log('🔑 Detected admin email, setting role to admin');
    }
    
    const userDocRef = doc(db, COLLECTIONS.USERS, userId);
    
    // Create document
    await setDoc(userDocRef, {
      uid: userId,
      email: currentUser.email || userData.email || 'unknown',
      name: userData.name || 
            currentUser.displayName || 
            currentUser.email?.split('@')[0] || 
            'User',
      role: userData.role || role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: 'auto-created',
      autoCreated: true,
      ...userData
    });
    
    console.log('✅ User document auto-created with role:', role);
    
    return role;
    
  } catch (error) {
    console.error('❌ Failed to auto-create user document:', error);
    return null;
  }
}

// ========================================
// ROLE MANAGEMENT FUNCTIONS
// ========================================

/**
 * Get user role from Firestore (with auto-create for missing users)
 * @param {string} userId - User ID
 * @param {boolean} autoCreate - Auto-create if missing (default: true)
 * @returns {Promise<string|null>} User role or null
 */
export async function getUserRole(userId, autoCreate = true) {
  try {
    if (!userId) {
      console.warn('⚠️ getUserRole: No userId provided');
      return null;
    }
    
    const userDocRef = doc(db, COLLECTIONS.USERS, userId);
    let userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      console.warn('⚠️ User document not found for:', userId);
      
      // ✅ Auto-create if enabled
      if (autoCreate) {
        console.log('🔄 Attempting auto-create...');
        
        const createdRole = await autoCreateUserDocument(userId);
        
        if (createdRole) {
          // Fetch the newly created document
          userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const newUserData = userDoc.data();
            console.log('✅ Returning auto-created role:', newUserData.role);
            return newUserData.role || null;
          }
        } else {
          console.warn('⚠️ Auto-create failed');
        }
      }
      
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
 * Check if user is admin (with auto-create)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
  const role = await getUserRole(userId, true);
  return role === ROLES.ADMIN;
}

/**
 * Check if user has specific role
 * @param {string} userId - User ID
 * @param {string} requiredRole - Required role
 * @returns {Promise<boolean>}
 */
export async function hasRole(userId, requiredRole) {
  const role = await getUserRole(userId, true);
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
 * Get current user with role (with auto-create)
 * @returns {Promise<object|null>}
 */
export async function getCurrentUserWithRole() {
  const user = await getCurrentUser();
  
  if (!user) return null;
  
  const role = await getUserRole(user.uid, true);
  
  return {
    ...user,
    role: role,
    isAdmin: role === ROLES.ADMIN
  };
}

/**
 * Manually create or update user document
 * @param {string} userId - User ID
 * @param {object} userData - User data
 * @returns {Promise<boolean>}
 */
export async function createOrUpdateUser(userId, userData) {
  try {
    if (!userId) {
      console.error('❌ No userId provided');
      return false;
    }
    
    const userDocRef = doc(db, COLLECTIONS.USERS, userId);
    
    await setDoc(userDocRef, {
      uid: userId,
      updatedAt: serverTimestamp(),
      ...userData
    }, { merge: true });
    
    console.log('✅ User document created/updated:', userId);
    return true;
    
  } catch (error) {
    console.error('❌ Error creating/updating user:', error);
    return false;
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

export function getCollectionPath(collectionName = 'attendance') {
  const path = COLLECTIONS[collectionName.toUpperCase()] || collectionName;
  console.log(`📁 Collection path: ${path}`);
  return path;
}

export function getCollections() {
  return COLLECTIONS;
}

export function getRoles() {
  return ROLES;
}

export function isFirebaseInitialized() {
  return !!(app && auth && db);
}

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
  ROLES,
  autoCreateUserDocument,
  createOrUpdateUser
};

// ========================================
// GLOBAL EXPOSURE (Optional)
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
console.log('Auto-Create: ✅ Enabled');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
