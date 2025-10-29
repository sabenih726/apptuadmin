// js/employee-app.js
import { app, auth, db, getCollectionPath } from '/firebase-config.js';
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
let attendanceType = 'masuk'; // 'masuk' atau 'pulang'
let attendanceData = {
  photoBase64: null,
  locationName: null,
  latitude: null,
  longitude: null
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
function updateStatus(msg) {
  console.log(msg);
  DOM.statusMessage.textContent = msg;
}

// Compress image to reduce size
function compressImage(base64String, maxWidth = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Compress to JPEG with 0.7 quality
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
      resolve(compressedBase64);
    };
    img.src = base64String;
  });
}

// ========================================
// AUTHENTICATION
// ========================================
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      DOM.userStatus.textContent = `User: ${user.email || user.uid.slice(-6)}`;
      DOM.startBtn.disabled = false;
      updateStatus('Sistem siap digunakan');
      await checkLastAttendance(user.uid);
      loadUserHistory(user.uid);
    } else {
      // Auto login anonymous
      try {
        await signInAnonymously(auth);
        updateStatus('Login sebagai tamu...');
      } catch (error) {
        updateStatus('Gagal login. Refresh halaman.');
        console.error(error);
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
    console.error('Error checking attendance:', error);
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
            ${data.type.toUpperCase()}
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
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Simple location name
        const locName = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;
        
        attendanceData.locationName = locName;
        attendanceData.latitude = latitude;
        attendanceData.longitude = longitude;
        
        DOM.locationMessage.textContent = locName;
        updateStatus('Lokasi berhasil didapat');
        resolve(locName);
      },
      (error) => {
        console.error('Location error:', error);
        updateStatus('Gagal mendapat lokasi, lanjut tanpa lokasi');
        // Continue without location
        attendanceData.locationName = 'Unknown';
        resolve('Unknown');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// ========================================
// CAMERA FUNCTIONS
// ========================================
async function startCamera() {
  try {
    updateStatus('Mengaktifkan kamera...');
    
    // Stop previous stream if exists
    if (streamInstance) {
      streamInstance.getTracks().forEach(track => track.stop());
    }
    
    // Start camera
    streamInstance = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    
    DOM.video.srcObject = streamInstance;
    DOM.video.style.display = 'block';
    DOM.videoPlaceholder.classList.add('hidden');
    
    updateStatus('Kamera aktif, silakan ambil foto');
  } catch (error) {
    console.error('Camera error:', error);
    updateStatus('Gagal mengakses kamera. Periksa izin kamera.');
  }
}

function capturePhoto() {
  if (!streamInstance) {
    updateStatus('Kamera tidak aktif');
    return;
  }
  
  // Draw to hidden canvas
  const ctx = DOM.canvasHidden.getContext('2d');
  DOM.canvasHidden.width = DOM.video.videoWidth;
  DOM.canvasHidden.height = DOM.video.videoHeight;
  ctx.drawImage(DOM.video, 0, 0);
  
  // Get base64 string
  attendanceData.photoBase64 = DOM.canvasHidden.toDataURL('image/jpeg', 0.8);
  
  // Show captured image
  const ctxCapture = DOM.canvasCapture.getContext('2d');
  DOM.canvasCapture.width = DOM.video.videoWidth;
  DOM.canvasCapture.height = DOM.video.videoHeight;
  ctxCapture.drawImage(DOM.video, 0, 0);
  DOM.canvasCapture.style.display = 'block';
  
  // Hide video and stop camera
  DOM.video.style.display = 'none';
  if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
  }
  
  // Update UI
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.remove('hidden');
  
  updateStatus('Foto berhasil diambil');
}

// ========================================
// SUBMIT ATTENDANCE
// ========================================
async function submitAttendance() {
  if (!attendanceData.photoBase64) {
    updateStatus('Silakan ambil foto terlebih dahulu');
    return;
  }
  
  DOM.submitBtn.disabled = true;
  updateStatus('Mengompresi foto...');
  
  try {
    // Compress photo to reduce Firestore document size
    const compressedPhoto = await compressImage(attendanceData.photoBase64, 600);
    
    // Check size (Firestore document max 1MB)
    const sizeInKB = Math.round(compressedPhoto.length * 3 / 4 / 1024);
    console.log(`Photo size: ${sizeInKB} KB`);
    
    if (sizeInKB > 900) {
      throw new Error('Foto terlalu besar. Coba ambil ulang.');
    }
    
    updateStatus('Mengirim data absensi...');
    
    // Prepare data
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
      photoBase64: compressedPhoto, // Simpan foto sebagai base64
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
    };
    
    // Save to Firestore
    await addDoc(collection(db, getCollectionPath()), data);
    
    updateStatus(`✅ Absensi ${attendanceType} berhasil!`);
    
    // Update attendance type for next submission
    if (attendanceType === 'masuk') {
      attendanceType = 'pulang';
      DOM.startBtn.textContent = 'Mulai Absen Pulang';
    } else {
      attendanceType = 'masuk';
      DOM.startBtn.textContent = 'Mulai Absen Masuk';
    }
    
    // Reset UI after delay
    setTimeout(resetUI, 2000);
    
  } catch (error) {
    console.error('Submit error:', error);
    updateStatus(`Gagal: ${error.message}`);
    
    // Save to localStorage if offline
    if (!navigator.onLine) {
      saveOfflineData(data);
      updateStatus('Disimpan offline, akan dikirim saat online');
    }
  } finally {
    DOM.submitBtn.disabled = false;
  }
}

// ========================================
// OFFLINE SUPPORT
// ========================================
function saveOfflineData(data) {
  try {
    const offlineData = JSON.parse(localStorage.getItem('offline_attendance') || '[]');
    offlineData.push({
      ...data,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem('offline_attendance', JSON.stringify(offlineData));
    console.log('Saved offline:', offlineData.length, 'records');
  } catch (error) {
    console.error('Failed to save offline:', error);
  }
}

async function syncOfflineData() {
  if (!navigator.onLine || !currentUserId) return;
  
  try {
    const offlineData = JSON.parse(localStorage.getItem('offline_attendance') || '[]');
    if (offlineData.length === 0) return;
    
    console.log('Syncing', offlineData.length, 'offline records...');
    
    for (const record of offlineData) {
      await addDoc(collection(db, getCollectionPath()), record);
    }
    
    localStorage.removeItem('offline_attendance');
    updateStatus(`${offlineData.length} data offline berhasil dikirim`);
  } catch (error) {
    console.error('Sync error:', error);
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
  
  // Reset photo data
  attendanceData.photoBase64 = null;
  
  // Reset UI elements
  DOM.video.style.display = 'none';
  DOM.canvasCapture.style.display = 'none';
  DOM.videoPlaceholder.classList.remove('hidden');
  
  DOM.startBtn.classList.remove('hidden');
  DOM.captureBtn.classList.add('hidden');
  DOM.submitBtn.classList.add('hidden');
  DOM.resetBtn.classList.add('hidden');
  
  DOM.startBtn.disabled = false;
  
  updateStatus('Sistem siap digunakan');
}

// ========================================
// EVENT HANDLERS
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

// Network status
window.addEventListener('online', () => {
  DOM.offlineStatus.classList.add('hidden');
  updateStatus('Kembali online');
  syncOfflineData();
});

window.addEventListener('offline', () => {
  DOM.offlineStatus.classList.remove('hidden');
  updateStatus('Mode offline - data akan disimpan lokal');
});

// ========================================
// SERVICE WORKER (Optional)
// ========================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(reg => console.log('Service Worker registered'))
    .catch(err => console.log('Service Worker registration failed'));
}

// ========================================
// INITIALIZE APP
// ========================================
handleAuth();
