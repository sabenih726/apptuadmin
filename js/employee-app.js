// js/employee-app.js
console.log('📱 Loading employee-app.js...');

// ✅ METHOD 1: Use global (set by HTML)
const auth = window.firebaseAuth;
const db = window.firebaseDB;
const getCollectionPath = window.getCollectionPath;

// OR ✅ METHOD 2: Import directly (use ABSOLUTE path)
// import { auth, db, getCollectionPath } from '/firebase-config.js';

// Verify Firebase is loaded
if (!auth || !db) {
  console.error('❌ Firebase not initialized!');
  alert('System error: Firebase not initialized');
  throw new Error('Firebase not initialized');
}

console.log('✅ Firebase verified in employee-app.js');

// Import Firebase modules
import { 
  signInAnonymously, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

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
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
  statusMessage: document.getElementById('status-message'),
  locationMessage: document.getElementById('location-message'),
  userStatus: document.getElementById('user-status'),
  historyContainer: document.getElementById('history-container'),
  offlineStatus: document.getElementById('offline-status')
};

// ========================================
// STATE
// ========================================
let currentUserId = null;
let streamInstance = null;
let attendanceType = 'masuk';
let attendanceData = {
  photoBase64: null,
  locationName: null,
  latitude: null,
  longitude: null
};

// ========================================
// UTILITY
// ========================================
function updateStatus(msg) {
  console.log('Status:', msg);
  DOM.statusMessage.textContent = msg;
}

// ========================================
// AUTHENTICATION
// ========================================
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      DOM.userStatus.textContent = `User: ${user.uid.slice(-6)}`;
      DOM.startBtn.disabled = false;
      updateStatus('Sistem siap digunakan');
      await checkLastAttendance(user.uid);
      loadUserHistory(user.uid);
    } else {
      try {
        updateStatus('Login otomatis...');
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Auth error:', error);
        updateStatus('Gagal login: ' + error.message);
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
      collection(db, getCollectionPath()),
      where("userId", "==", userId),
      where("timestamp", ">=", Timestamp.fromDate(today)),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const lastRecord = snapshot.docs[0].data();
      if (lastRecord.type === 'masuk') {
        attendanceType = 'pulang';
        DOM.startBtn.textContent = 'Mulai Absen Pulang';
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
  
  const q = query(
    collection(db, getCollectionPath()),
    where("userId", "==", userId),
    where("timestamp", ">=", Timestamp.fromDate(today)),
    orderBy("timestamp", "desc")
  );
  
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      DOM.historyContainer.innerHTML = '<p class="text-gray-400">Belum ada riwayat hari ini.</p>';
      return;
    }
    
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      const time = data.timestamp?.toDate() || new Date();
      return `
        <div class="flex justify-between border-b border-gray-800 py-2">
          <span class="${data.type === 'masuk' ? 'text-green-400' : 'text-yellow-400'} font-bold">
            ${data.type?.toUpperCase() || '-'}
          </span>
          <span>${time.toLocaleTimeString('id-ID')}</span>
          <span class="text-gray-500 text-sm">${data.locationName || 'Unknown'}</span>
        </div>
      `;
    });
    
    DOM.historyContainer.innerHTML = history.join('');
  });
}

// ========================================
// GEOLOCATION
// ========================================
async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolokasi tidak didukung"));
      return;
    }
    
    updateStatus('Mendapatkan lokasi...');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        
        attendanceData.locationName = locName;
        attendanceData.latitude = latitude;
        attendanceData.longitude = longitude;
        
        DOM.locationMessage.textContent = locName;
        updateStatus('Lokasi berhasil didapat');
        resolve(locName);
      },
      (error) => {
        console.error('Location error:', error);
        updateStatus('Lanjut tanpa lokasi');
        attendanceData.locationName = 'Unknown';
        resolve('Unknown');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ========================================
// CAMERA
// ========================================
async function startCamera() {
  try {
    updateStatus('Mengaktifkan kamera...');
    
    if (streamInstance) {
      streamInstance.getTracks().forEach(track => track.stop());
    }
    
    streamInstance = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    
    DOM.video.srcObject = streamInstance;
    DOM.video.style.display = 'block';
    DOM.videoPlaceholder.classList.add('hidden');
    
    updateStatus('Kamera aktif, ambil foto');
  } catch (error) {
    console.error('Camera error:', error);
    updateStatus('Gagal akses kamera');
  }
}

function capturePhoto() {
  if (!streamInstance) return;
  
  const ctx = DOM.canvasHidden.getContext('2d');
  DOM.canvasHidden.width = DOM.video.videoWidth;
  DOM.canvasHidden.height = DOM.video.videoHeight;
  ctx.drawImage(DOM.video, 0, 0);
  
  attendanceData.photoBase64 = DOM.canvasHidden.toDataURL('image/jpeg', 0.7);
  
  const ctxCapture = DOM.canvasCapture.getContext('2d');
  DOM.canvasCapture.width = DOM.video.videoWidth;
  DOM.canvasCapture.height = DOM.video.videoHeight;
  ctxCapture.drawImage(DOM.video, 0, 0);
  DOM.canvasCapture.style.display = 'block';
  
  DOM.video.style.display = 'none';
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.remove('hidden');
  
  updateStatus('Foto berhasil diambil');
}

// ========================================
// SUBMIT
// ========================================
async function submitAttendance() {
  if (!attendanceData.photoBase64) {
    updateStatus('Ambil foto dulu');
    return;
  }
  
  DOM.submitBtn.disabled = true;
  updateStatus('Mengirim...');
  
  try {
    const data = {
      userId: currentUserId,
      type: attendanceType,
      status: 'hadir',
      timestamp: serverTimestamp(),
      locationName: attendanceData.locationName || 'Unknown',
      coordinates: {
        latitude: attendanceData.latitude,
        longitude: attendanceData.longitude
      },
      photoBase64: attendanceData.photoBase64
    };
    
    await addDoc(collection(db, getCollectionPath()), data);
    
    updateStatus(`✅ Absensi ${attendanceType} berhasil!`);
    
    if (attendanceType === 'masuk') {
      attendanceType = 'pulang';
      DOM.startBtn.textContent = 'Mulai Absen Pulang';
    } else {
      attendanceType = 'masuk';
      DOM.startBtn.textContent = 'Mulai Absen Masuk';
    }
    
    setTimeout(resetUI, 2000);
    
  } catch (error) {
    console.error('Submit error:', error);
    updateStatus('Gagal: ' + error.message);
  } finally {
    DOM.submitBtn.disabled = false;
  }
}

// ========================================
// RESET
// ========================================
function resetUI() {
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  attendanceData.photoBase64 = null;
  
  DOM.video.style.display = 'none';
  DOM.canvasCapture.style.display = 'none';
  DOM.videoPlaceholder.classList.remove('hidden');
  
  DOM.startBtn.classList.remove('hidden');
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.add('hidden');
  DOM.resetBtn.classList.add('hidden');
  
  updateStatus('Sistem siap');
}

// ========================================
// EVENT LISTENERS
// ========================================
DOM.startBtn.addEventListener('click', async () => {
  DOM.startBtn.disabled = true;
  await getLocation();
  await startCamera();
  
  DOM.startBtn.classList.add('hidden');
  DOM.captureBtn.classList.remove('hidden');
  DOM.resetBtn.classList.remove('hidden');
});

DOM.captureBtn.addEventListener('click', capturePhoto);
DOM.submitBtn.addEventListener('click', submitAttendance);
DOM.resetBtn.addEventListener('click', resetUI);

window.addEventListener('online', () => {
  DOM.offlineStatus.classList.add('hidden');
});

window.addEventListener('offline', () => {
  DOM.offlineStatus.classList.remove('hidden');
});

// ========================================
// INITIALIZE
// ========================================
console.log('Starting authentication...');
handleAuth();
