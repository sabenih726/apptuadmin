// js/employee-app.js
console.log('📱 Loading employee-app.js...');

// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { 
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { 
  getFirestore,
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

// Import config
import { firebaseConfig } from '/firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('✅ Firebase initialized');

// ========================================
// CONFIG
// ========================================
const COLLECTION_NAME = 'attendance'; // Nama collection untuk absensi
const USE_ANONYMOUS_AUTH = true; // Set false jika mau pakai email/password

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
  DOM.statusMessage.textContent = msg;
  DOM.statusMessage.className = isError ? 'text-red-400' : 'text-gray-300';
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
      const displayName = user.email || `User-${user.uid.slice(-6)}`;
      DOM.userStatus.textContent = displayName;
      
      if (!USE_ANONYMOUS_AUTH) {
        DOM.logoutBtn.classList.remove('hidden');
      }
      
      DOM.startBtn.disabled = false;
      updateStatus('Sistem siap digunakan');
      
      // Check last attendance
      await checkLastAttendance(user.uid);
      
      // Load history
      loadUserHistory(user.uid);
      
    } else {
      // Not logged in
      if (USE_ANONYMOUS_AUTH) {
        // Auto login with anonymous
        try {
          updateStatus('Login otomatis...');
          const result = await signInAnonymously(auth);
          console.log('✅ Anonymous login success:', result.user.uid);
        } catch (error) {
          console.error('❌ Anonymous auth error:', error);
          updateStatus('Gagal login: ' + error.message, true);
          
          // Fallback: redirect to login page
          if (error.code === 'auth/admin-restricted-operation') {
            updateStatus('Anonymous auth tidak aktif. Redirecting...', true);
            setTimeout(() => {
              window.location.href = '/login.html';
            }, 2000);
          }
        }
      } else {
        // Redirect to login page
        window.location.href = '/login.html';
      }
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
        DOM.startBtn.textContent = 'Mulai Absen Pulang';
        DOM.startBtn.className = 'btn-primary w-full bg-gradient-to-r from-yellow-500 to-orange-500';
      } else {
        attendanceType = 'masuk';
        DOM.startBtn.textContent = 'Mulai Absen Masuk';
      }
    }
  } catch (error) {
    console.error('Check attendance error:', error);
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
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
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
        DOM.historyContainer.innerHTML = '<p class="text-red-400">Error loading history</p>';
      }
    );
    
  } catch (error) {
    console.error('Load history error:', error);
    DOM.historyContainer.innerHTML = '<p class="text-red-400">Error: ' + error.message + '</p>';
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
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locName = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        attendanceData.locationName = locName;
        attendanceData.latitude = latitude;
        attendanceData.longitude = longitude;
        
        DOM.locationMessage.textContent = `📍 ${locName}`;
        updateStatus('Lokasi berhasil didapat');
        resolve(locName);
      },
      (error) => {
        console.warn('Location error:', error);
        updateStatus('Lanjut tanpa lokasi');
        attendanceData.locationName = 'Location unavailable';
        DOM.locationMessage.textContent = '📍 Lokasi tidak tersedia';
        resolve('Unknown');
      },
      options
    );
  });
}

// ========================================
// CAMERA
// ========================================
async function startCamera() {
  try {
    updateStatus('Mengaktifkan kamera...');
    
    // Stop any existing stream
    if (streamInstance) {
      streamInstance.getTracks().forEach(track => track.stop());
    }
    
    // Request camera access
    streamInstance = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    DOM.video.srcObject = streamInstance;
    DOM.video.style.display = 'block';
    DOM.videoPlaceholder.style.display = 'none';
    
    updateStatus('Kamera aktif - Ambil foto Anda');
    
  } catch (error) {
    console.error('Camera error:', error);
    updateStatus('Gagal mengakses kamera: ' + error.message, true);
    
    // Reset UI if camera fails
    resetUI();
  }
}

function capturePhoto() {
  if (!streamInstance) {
    updateStatus('Kamera tidak aktif', true);
    return;
  }
  
  // Draw to hidden canvas for data
  const ctx = DOM.canvasHidden.getContext('2d');
  DOM.canvasHidden.width = DOM.video.videoWidth;
  DOM.canvasHidden.height = DOM.video.videoHeight;
  ctx.drawImage(DOM.video, 0, 0);
  
  // Store photo data
  attendanceData.photoBase64 = DOM.canvasHidden.toDataURL('image/jpeg', 0.7);
  
  // Draw to visible canvas for display
  const ctxCapture = DOM.canvasCapture.getContext('2d');
  DOM.canvasCapture.width = DOM.video.videoWidth;
  DOM.canvasCapture.height = DOM.video.videoHeight;
  ctxCapture.drawImage(DOM.video, 0, 0);
  DOM.canvasCapture.style.display = 'block';
  
  // Hide video and stop stream
  DOM.video.style.display = 'none';
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  // Update buttons
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.remove('hidden');
  
  updateStatus('Foto berhasil diambil - Kirim absensi?');
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
    
    // Update button for next attendance
    if (attendanceType === 'masuk') {
      attendanceType = 'pulang';
      DOM.startBtn.textContent = 'Mulai Absen Pulang';
      DOM.startBtn.className = 'btn-primary w-full bg-gradient-to-r from-yellow-500 to-orange-500';
    } else {
      attendanceType = 'masuk';
      DOM.startBtn.textContent = 'Mulai Absen Masuk';
      DOM.startBtn.className = 'btn-primary w-full';
    }
    
    // Reset after 2 seconds
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
  // Stop camera if still running
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  // Clear data
  attendanceData = {
    photoBase64: null,
    locationName: null,
    latitude: null,
    longitude: null
  };
  
  // Reset display
  DOM.video.style.display = 'none';
  DOM.canvasCapture.style.display = 'none';
  DOM.videoPlaceholder.style.display = 'flex';
  
  // Reset buttons
  DOM.startBtn.classList.remove('hidden');
  DOM.startBtn.disabled = false;
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.add('hidden');
  DOM.resetBtn.classList.add('hidden');
  
  DOM.locationMessage.textContent = '';
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

// Network status
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
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Starting Employee App...');
  initAuth();
});
