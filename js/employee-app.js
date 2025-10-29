// js/employee-app.js
console.log('📱 Loading employee-app.js...');

// ========================================
// IMPORT FIREBASE MODULES & CONFIG
// ========================================
import { 
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
  doc,
  getDoc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// ✅ Import dari firebase-config.js
import { 
  auth, 
  db, 
  getCollectionPath,
  COLLECTIONS,
  isFirebaseInitialized 
} from '/firebase-config.js';

// ========================================
// VERIFY FIREBASE
// ========================================
if (!isFirebaseInitialized()) {
  console.error('❌ Firebase not initialized!');
  alert('System error: Firebase not initialized');
  throw new Error('Firebase not initialized');
}

console.log('✅ Firebase verified in employee-app.js');

// ========================================
// CONFIG
// ========================================
const USE_ANONYMOUS_AUTH = false;
const COLLECTION_NAME = getCollectionPath();

// ========================================
// DOM ELEMENTS
// ========================================
const DOM = {
  video: document.getElementById('video'),
  videoPlaceholder: document.getElementById('video-placeholder'),
  canvasCapture: document.getElementById('canvas-capture'),
  canvasHidden: document.getElementById('canvas-hidden'),
  startBtn: document.getElementById('start-btn'),
  captureBtn: document.getElementById('capture-btn'),
  submitBtn: document.getElementById('submit-btn'),
  resetBtn: document.getElementById('reset-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  statusMessage: document.getElementById('status-message'),
  locationMessage: document.getElementById('location-message'),
  userStatus: document.getElementById('user-status'),
  historyContainer: document.getElementById('history-container'),
  offlineStatus: document.getElementById('offline-status')
};

// ========================================
// STATE
// ========================================
let currentUser = null;
let streamInstance = null;
let attendanceType = 'masuk';
let attendanceData = {
  photoBase64: null,
  locationName: null,
  latitude: null,
  longitude: null
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
function updateStatus(msg, isError = false) {
  console.log('Status:', msg);
  if (DOM.statusMessage) {
    DOM.statusMessage.textContent = msg;
    DOM.statusMessage.className = isError ? 'text-red-400' : 'text-gray-300';
  }
}

function formatTime(date) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ========================================
// DEBUG & AUTO-CREATE USER DOCUMENT
// ========================================
async function ensureUserDocument() {
  const user = auth.currentUser;
  
  if (!user) {
    console.log('⚠️ No user logged in');
    return false;
  }
  
  console.log('🔍 Checking user document for:', user.uid);
  console.log('📧 User Email:', user.email);
  
  try {
    // Check if user document exists
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log('✅ User document exists:', userData);
      console.log('👤 Role:', userData.role);
      console.log('✓ Active:', userData.active);
      return true;
    } else {
      console.log('⚠️ User document NOT FOUND. Auto-creating...');
      
      // Auto-create user document
      const newUserData = {
        uid: user.uid,
        email: user.email || 'unknown',
        name: user.displayName || user.email?.split('@')[0] || 'User',
        role: 'employee',
        active: true,
        createdAt: serverTimestamp(),
        autoCreated: true,
        createdFrom: 'employee-app'
      };
      
      await setDoc(userDocRef, newUserData);
      
      console.log('✅ User document auto-created successfully!');
      console.log('📄 Created data:', newUserData);
      
      // Wait a bit for Firestore to sync
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error ensuring user document:', error);
    
    if (error.code === 'permission-denied') {
      console.error('🔒 Permission denied! Check Firestore Rules!');
      updateStatus('⚠️ Permission denied. Contact admin.', true);
      
      // Show detailed error
      alert(
        '❌ Permission Denied!\n\n' +
        'Kemungkinan masalah:\n' +
        '1. Firestore Rules belum di-deploy\n' +
        '2. User tidak punya akses create document\n\n' +
        'Solusi:\n' +
        '1. Deploy rules: firebase deploy --only firestore:rules\n' +
        '2. Contact admin untuk aktivasi akun'
      );
    } else {
      updateStatus('⚠️ Error: ' + error.message, true);
    }
    
    return false;
  }
}

// ========================================
// AUTHENTICATION
// ========================================
async function initAuth() {
  updateStatus('Menginisialisasi...');
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 USER AUTHENTICATED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('UID:', user.uid);
      console.log('Email:', user.email);
      console.log('Display Name:', user.displayName);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      updateStatus('Memeriksa user document...');
      
      // ✅ Ensure user document exists
      const userReady = await ensureUserDocument();
      
      if (!userReady) {
        updateStatus('❌ Gagal setup user document. Silakan refresh halaman.', true);
        console.error('❌ User document setup failed!');
        
        // Show retry button
        setTimeout(() => {
          if (confirm('User setup gagal. Retry?')) {
            location.reload();
          }
        }, 2000);
        
        return;
      }
      
      console.log('✅ User ready for attendance');
      
      const displayName = user.email || user.displayName || `User-${user.uid.slice(-6)}`;
      if (DOM.userStatus) DOM.userStatus.textContent = displayName;
      
      // Always show logout button
      if (DOM.logoutBtn) {
        DOM.logoutBtn.classList.remove('hidden');
      }
      
      if (DOM.startBtn) DOM.startBtn.disabled = false;
      updateStatus('Sistem siap digunakan');
      
      // Load attendance data
      await checkLastAttendance(user.uid);
      loadUserHistory(user.uid);
      
    } else {
      // Redirect to login if not authenticated
      console.log('❌ User not logged in. Redirecting to login...');
      updateStatus('Redirecting to login...', false);
      
      setTimeout(() => {
        window.location.href = '/login.html?redirect=employee';
      }, 1000);
    }
  });
}

// ========================================
// CHECK LAST ATTENDANCE
// ========================================
async function checkLastAttendance(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('🔍 Checking last attendance for today...');
    
    const q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const lastRecord = snapshot.docs[0].data();
      console.log('✅ Found last attendance:', lastRecord.type, 'at', lastRecord.timestamp?.toDate());
      
      if (lastRecord.type === 'masuk') {
        attendanceType = 'pulang';
        if (DOM.startBtn) {
          DOM.startBtn.textContent = 'Mulai Absen Pulang';
          DOM.startBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        }
        console.log('📌 Set attendance type to: PULANG');
      } else {
        console.log('📌 Set attendance type to: MASUK');
      }
    } else {
      console.log('ℹ️ No attendance record today');
    }
    
  } catch (error) {
    console.error('❌ Check attendance error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // ✅ Better error handling
    if (error.code === 'failed-precondition') {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ MISSING COMPOSITE INDEX!');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Collection:', COLLECTION_NAME);
      console.error('Fields needed: userId (ASC), timestamp (DESC)');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      updateStatus('⚠️ Setting up database index. Please wait...', false);
      
      // Extract auto-create link from error
      if (error.message.includes('https://')) {
        const urlMatch = error.message.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          console.log('📝 Auto-create index here:');
          console.log(urlMatch[0]);
          
          setTimeout(() => {
            if (confirm('Database index belum ada.\n\nBuka link auto-create di console?\n(Tekan F12 untuk lihat console)')) {
              window.open(urlMatch[0], '_blank');
            }
          }, 1000);
        }
      }
      
    } else if (error.code === 'permission-denied') {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ PERMISSION DENIED!');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Collection:', COLLECTION_NAME);
      console.error('User ID:', userId);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      updateStatus('⚠️ Permission denied. Check Firestore Rules!', true);
      
      setTimeout(() => {
        alert(
          '❌ Firestore Permission Denied!\n\n' +
          'Solusi:\n' +
          '1. Deploy Firestore Rules:\n' +
          '   firebase deploy --only firestore:rules\n\n' +
          '2. Pastikan rules membolehkan read untuk collection "' + COLLECTION_NAME + '"\n\n' +
          '3. Refresh halaman setelah deploy'
        );
      }, 500);
      
    } else {
      updateStatus('⚠️ Error: ' + error.message, true);
    }
  }
}

// ========================================
// LOAD HISTORY
// ========================================
function loadUserHistory(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    console.log('📊 Loading attendance history...');
    
    const q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      orderBy('timestamp', 'desc')
    );
    
    onSnapshot(q, 
      (snapshot) => {
        if (!DOM.historyContainer) return;
        
        if (snapshot.empty) {
          DOM.historyContainer.innerHTML = '<p class="text-gray-400">Belum ada riwayat hari ini.</p>';
          console.log('ℹ️ No history records today');
          return;
        }
        
        console.log(`✅ Loaded ${snapshot.docs.length} history records`);
        
        const history = snapshot.docs.map(doc => {
          const data = doc.data();
          const time = data.timestamp?.toDate() || new Date();
          const typeColor = data.type === 'masuk' ? 'text-green-400' : 'text-yellow-400';
          
          return `
            <div class="flex justify-between items-center border-b border-gray-800 py-3">
              <span class="${typeColor} font-bold uppercase text-sm">
                ${data.type || '-'}
              </span>
              <span class="text-white">${formatTime(time)}</span>
              <span class="text-gray-500 text-xs">${data.locationName || 'Unknown'}</span>
            </div>
          `;
        });
        
        DOM.historyContainer.innerHTML = history.join('');
      },
      (error) => {
        console.error('❌ History error:', error);
        if (DOM.historyContainer) {
          DOM.historyContainer.innerHTML = '<p class="text-red-400">Error: ' + error.message + '</p>';
        }
      }
    );
    
  } catch (error) {
    console.error('❌ Load history error:', error);
  }
}

// ========================================
// ✅ NEW: REVERSE GEOCODING FUNCTION
// ========================================

/**
 * Get address from coordinates using OpenStreetMap Nominatim
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Promise<string>} Address string
 */
async function getAddressFromCoordinates(latitude, longitude) {
  try {
    console.log('🗺️ Getting address from coordinates...');
    
    // Using OpenStreetMap Nominatim (Free, no API key needed)
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'ApptU-Admin-App' // Required by Nominatim
      }
    });
    
    if (!response.ok) {
      throw new Error('Geocoding API error');
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Build readable address
    const address = data.address || {};
    
    // Extract relevant parts
    const parts = [];
    
    // Street/Road
    if (address.road) parts.push(address.road);
    if (address.neighbourhood) parts.push(address.neighbourhood);
    
    // District/Suburb
    if (address.suburb) parts.push(address.suburb);
    else if (address.village) parts.push(address.village);
    
    // City
    if (address.city) parts.push(address.city);
    else if (address.county) parts.push(address.county);
    else if (address.state) parts.push(address.state);
    
    // Use display_name as fallback
    const addressString = parts.length > 0 
      ? parts.join(', ')
      : data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    
    console.log('✅ Address found:', addressString);
    
    return addressString;
    
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    
    // Fallback to coordinates
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
}

// ========================================
// UPDATE: GEOLOCATION FUNCTION
// ========================================
async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      updateStatus('Geolokasi tidak didukung');
      resolve({ address: 'Unknown', latitude: null, longitude: null });
      return;
    }
    
    updateStatus('Mendapatkan lokasi...');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        updateStatus('Mendapatkan alamat...');
        
        // ✅ Get address from coordinates
        const address = await getAddressFromCoordinates(latitude, longitude);
        
        // Store in state
        attendanceData.locationName = address;
        attendanceData.latitude = latitude;
        attendanceData.longitude = longitude;
        
        // Display address (not coordinates)
        if (DOM.locationMessage) {
          DOM.locationMessage.innerHTML = `
            <div class="flex items-start">
              <i class="fas fa-map-marker-alt mr-2 mt-1 text-blue-400"></i>
              <div class="flex-1">
                <p class="text-sm text-white font-semibold">Lokasi:</p>
                <p class="text-xs text-gray-300 mt-1">${address}</p>
                <p class="text-xs text-gray-500 mt-1">
                  ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
                </p>
              </div>
            </div>
          `;
        }
        
        updateStatus('Lokasi berhasil didapat');
        resolve({ address, latitude, longitude });
      },
      (error) => {
        console.warn('Location error:', error);
        updateStatus('Lanjut tanpa lokasi');
        
        attendanceData.locationName = 'Location unavailable';
        attendanceData.latitude = null;
        attendanceData.longitude = null;
        
        if (DOM.locationMessage) {
          DOM.locationMessage.innerHTML = `
            <i class="fas fa-map-marker-alt mr-2 text-red-400"></i>
            <span class="text-xs text-red-400">Lokasi tidak tersedia</span>
          `;
        }
        
        resolve({ address: 'Unknown', latitude: null, longitude: null });
      },
      { 
        enableHighAccuracy: true, 
        timeout: 15000, // Increased timeout for geocoding
        maximumAge: 0 
      }
    );
  });
}

// ========================================
// CAMERA (WITH FALLBACK)
// ========================================
async function startCamera() {
  try {
    updateStatus('Mengaktifkan kamera...');
    
    if (streamInstance) {
      streamInstance.getTracks().forEach(track => track.stop());
    }
    
    const constraints = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true }
    ];
    
    let stream = null;
    let lastError = null;
    
    for (const constraint of constraints) {
      try {
        console.log('📷 Trying camera with:', constraint);
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        console.warn('⚠️ Camera constraint failed:', constraint, err.message);
        lastError = err;
      }
    }
    
    if (!stream) {
      throw lastError || new Error('No camera available');
    }
    
    streamInstance = stream;
    
    if (DOM.video) {
      DOM.video.srcObject = streamInstance;
      DOM.video.style.display = 'block';
    }
    if (DOM.videoPlaceholder) {
      DOM.videoPlaceholder.style.display = 'none';
    }
    
    updateStatus('Kamera aktif - Ambil foto Anda');
    console.log('✅ Camera started successfully');
    
  } catch (error) {
    console.error('❌ Camera error:', error);
    
    let errorMsg = 'Gagal mengakses kamera';
    if (error.name === 'NotFoundError') {
      errorMsg = 'Kamera tidak ditemukan. Gunakan device dengan kamera.';
    } else if (error.name === 'NotAllowedError') {
      errorMsg = 'Akses kamera ditolak. Izinkan akses kamera di browser.';
    } else if (error.name === 'NotReadableError') {
      errorMsg = 'Kamera sedang digunakan aplikasi lain.';
    }
    
    updateStatus(errorMsg, true);
    alert(errorMsg + '\n\nTips:\n- Pastikan device memiliki kamera\n- Berikan izin akses kamera\n- Tutup aplikasi lain yang menggunakan kamera');
    
    resetUI();
  }
}

function capturePhoto() {
  if (!streamInstance) {
    updateStatus('Kamera tidak aktif', true);
    return;
  }
  
  try {
    const ctx = DOM.canvasHidden.getContext('2d');
    DOM.canvasHidden.width = DOM.video.videoWidth || 640;
    DOM.canvasHidden.height = DOM.video.videoHeight || 480;
    ctx.drawImage(DOM.video, 0, 0);
    
    attendanceData.photoBase64 = DOM.canvasHidden.toDataURL('image/jpeg', 0.7);
    
    const ctxCapture = DOM.canvasCapture.getContext('2d');
    DOM.canvasCapture.width = DOM.video.videoWidth || 640;
    DOM.canvasCapture.height = DOM.video.videoHeight || 480;
    ctxCapture.drawImage(DOM.video, 0, 0);
    DOM.canvasCapture.style.display = 'block';
    
    DOM.video.style.display = 'none';
    if (streamInstance) {
      streamInstance.getTracks().forEach(track => track.stop());
      streamInstance = null;
    }
    
    DOM.captureBtn.classList.add('hidden');
    DOM.submitBtn.classList.remove('hidden');
    
    updateStatus('Foto berhasil diambil - Kirim absensi?');
    console.log('✅ Photo captured successfully');
  } catch (error) {
    console.error('❌ Capture error:', error);
    updateStatus('Gagal mengambil foto', true);
  }
}

// ========================================
// SUBMIT ATTENDANCE
// ========================================
async function submitAttendance() {
  if (!attendanceData.photoBase64) {
    updateStatus('Ambil foto terlebih dahulu', true);
    return;
  }
  
  if (!currentUser) {
    updateStatus('User tidak terautentikasi', true);
    return;
  }
  
  DOM.submitBtn.disabled = true;
  updateStatus('Mengirim absensi...');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 SUBMITTING ATTENDANCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('User ID:', currentUser.uid);
  console.log('Type:', attendanceType);
  console.log('Location:', attendanceData.locationName);
  console.log('Collection:', COLLECTION_NAME);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const attendanceRecord = {
      userId: currentUser.uid,
      userEmail: currentUser.email || 'anonymous',
      type: attendanceType,
      status: 'hadir',
      timestamp: serverTimestamp(),
      locationName: attendanceData.locationName || 'Unknown',
      coordinates: attendanceData.latitude && attendanceData.longitude ? {
        latitude: attendanceData.latitude,
        longitude: attendanceData.longitude
      } : null,
      photoBase64: attendanceData.photoBase64,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), attendanceRecord);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ATTENDANCE SAVED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Document ID:', docRef.id);
    console.log('Type:', attendanceType);
    console.log('Timestamp:', new Date().toISOString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    updateStatus(`✅ Absensi ${attendanceType} berhasil disimpan!`);
    
    // Change button for next attendance
    if (attendanceType === 'masuk') {
      attendanceType = 'pulang';
      DOM.startBtn.textContent = 'Mulai Absen Pulang';
      DOM.startBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    } else {
      attendanceType = 'masuk';
      DOM.startBtn.textContent = 'Mulai Absen Masuk';
      DOM.startBtn.style.background = '';
    }
    
    setTimeout(resetUI, 2000);
    
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ SUBMIT ERROR!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (error.code === 'permission-denied') {
      updateStatus('❌ Permission denied! Check Firestore Rules!', true);
      
      alert(
        '❌ Permission Denied!\n\n' +
        'Kemungkinan masalah:\n' +
        '1. Firestore Rules belum allow CREATE\n' +
        '2. User document belum ada\n' +
        '3. Rules terlalu ketat\n\n' +
        'Solusi:\n' +
        '1. Deploy rules: firebase deploy --only firestore:rules\n' +
        '2. Refresh halaman\n' +
        '3. Contact admin jika masih error'
      );
    } else {
      updateStatus('❌ Gagal mengirim: ' + error.message, true);
    }
  } finally {
    DOM.submitBtn.disabled = false;
  }
}

// ========================================
// RESET UI
// ========================================
function resetUI() {
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  attendanceData = {
    photoBase64: null,
    locationName: null,
    latitude: null,
    longitude: null
  };
  
  if (DOM.video) DOM.video.style.display = 'none';
  if (DOM.canvasCapture) DOM.canvasCapture.style.display = 'none';
  if (DOM.videoPlaceholder) DOM.videoPlaceholder.style.display = 'flex';
  
  if (DOM.startBtn) {
    DOM.startBtn.classList.remove('hidden');
    DOM.startBtn.disabled = false;
  }
  if (DOM.captureBtn) DOM.captureBtn.classList.add('hidden');
  if (DOM.submitBtn) DOM.submitBtn.classList.add('hidden');
  if (DOM.resetBtn) DOM.resetBtn.classList.add('hidden');
  
  if (DOM.locationMessage) DOM.locationMessage.textContent = '';
  updateStatus('Sistem siap');
  
  console.log('🔄 UI reset completed');
}

// ========================================
// LOGOUT
// ========================================
async function logout() {
  if (!confirm('Logout dari sistem?')) return;
  
  try {
    console.log('🔓 Logging out...');
    await signOut(auth);
    console.log('✅ Logged out successfully');
    window.location.href = '/login.html';
  } catch (error) {
    console.error('❌ Logout error:', error);
    alert('Logout failed: ' + error.message);
  }
}

// ========================================
// EVENT LISTENERS
// ========================================
DOM.startBtn?.addEventListener('click', async () => {
  console.log('🚀 Starting attendance process...');
  
  DOM.startBtn.disabled = true;
  DOM.startBtn.classList.add('hidden');
  DOM.resetBtn.classList.remove('hidden');
  
  await getLocation();
  await startCamera();
  
  if (streamInstance) {
    DOM.captureBtn.classList.remove('hidden');
  }
});

DOM.captureBtn?.addEventListener('click', capturePhoto);
DOM.submitBtn?.addEventListener('click', submitAttendance);
DOM.resetBtn?.addEventListener('click', resetUI);
DOM.logoutBtn?.addEventListener('click', logout);

window.addEventListener('online', () => {
  console.log('🌐 Online');
  DOM.offlineStatus?.classList.add('hidden');
  updateStatus('Online - Sistem siap');
});

window.addEventListener('offline', () => {
  console.log('📡 Offline');
  DOM.offlineStatus?.classList.remove('hidden');
  updateStatus('Offline - Data akan disimpan lokal');
});

// ========================================
// INITIALIZE APP
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 EMPLOYEE APP STARTING...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Collection:', COLLECTION_NAME);
console.log('Auth initialized:', !!auth);
console.log('Firestore initialized:', !!db);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
