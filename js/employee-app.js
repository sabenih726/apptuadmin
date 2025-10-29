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
  Timestamp
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
const USE_ANONYMOUS_AUTH = false; // ✅ Changed from true to false
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
// AUTHENTICATION
// ========================================
async function initAuth() {
  updateStatus('Menginisialisasi...');
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      const displayName = user.email || user.displayName || `User-${user.uid.slice(-6)}`;
      if (DOM.userStatus) DOM.userStatus.textContent = displayName;
      
      // ✅ Always show logout button
      if (DOM.logoutBtn) {
        DOM.logoutBtn.classList.remove('hidden');
      }
      
      if (DOM.startBtn) DOM.startBtn.disabled = false;
      updateStatus('Sistem siap digunakan');
      
      await checkLastAttendance(user.uid);
      loadUserHistory(user.uid);
      
    } else {
      // ✅ Redirect to login if not authenticated
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
      if (lastRecord.type === 'masuk') {
        attendanceType = 'pulang';
        if (DOM.startBtn) {
          DOM.startBtn.textContent = 'Mulai Absen Pulang';
          DOM.startBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        }
      }
    }
  } catch (error) {
    console.error('Check attendance error:', error);
    if (error.code === 'permission-denied') {
      updateStatus('⚠️ Error: Permission denied. Cek Firestore Rules!', true);
      setTimeout(() => {
        alert('Firestore Permission Denied!\n\nPastikan Firestore Rules sudah di-deploy:\n\nfirebase deploy --only firestore:rules');
      }, 1000);
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
          return;
        }
        
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
        console.error('History error:', error);
        if (DOM.historyContainer) {
          DOM.historyContainer.innerHTML = '<p class="text-red-400">Error: ' + error.message + '</p>';
        }
      }
    );
    
  } catch (error) {
    console.error('Load history error:', error);
  }
}

// ========================================
// GEOLOCATION
// ========================================
async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      updateStatus('Geolokasi tidak didukung');
      resolve('Unknown');
      return;
    }
    
    updateStatus('Mendapatkan lokasi...');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locName = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        attendanceData.locationName = locName;
        attendanceData.latitude = latitude;
        attendanceData.longitude = longitude;
        
        if (DOM.locationMessage) DOM.locationMessage.textContent = `📍 ${locName}`;
        updateStatus('Lokasi berhasil didapat');
        resolve(locName);
      },
      (error) => {
        console.warn('Location error:', error);
        updateStatus('Lanjut tanpa lokasi');
        attendanceData.locationName = 'Location unavailable';
        if (DOM.locationMessage) DOM.locationMessage.textContent = '📍 Lokasi tidak tersedia';
        resolve('Unknown');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
        console.log('Trying camera with:', constraint);
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        console.warn('Camera constraint failed:', constraint, err);
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
    
  } catch (error) {
    console.error('Camera error:', error);
    
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
  } catch (error) {
    console.error('Capture error:', error);
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
    console.log('✅ Attendance saved:', docRef.id);
    
    updateStatus(`✅ Absensi ${attendanceType} berhasil disimpan!`);
    
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
    console.error('❌ Submit error:', error);
    updateStatus('Gagal mengirim: ' + error.message, true);
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
}

// ========================================
// LOGOUT
// ========================================
async function logout() {
  try {
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ========================================
// EVENT LISTENERS
// ========================================
DOM.startBtn?.addEventListener('click', async () => {
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
  DOM.offlineStatus?.classList.add('hidden');
  updateStatus('Online - Sistem siap');
});

window.addEventListener('offline', () => {
  DOM.offlineStatus?.classList.remove('hidden');
  updateStatus('Offline - Data akan disimpan lokal');
});

// ========================================
// INITIALIZE APP
// ========================================
console.log('🚀 Starting Employee App...');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
