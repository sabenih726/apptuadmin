// js/employee-app.js
import { app, auth, db, storage, getCollectionPath } from '../firebase-config.js';
import { 
  signInAnonymously, 
  signInWithCustomToken,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
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
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";

// ========================================
// CONSTANTS & CONFIGURATION
// ========================================
const CONFIG = {
  PHOTO_QUALITY: 0.8,
  MAX_PHOTO_SIZE: 1024 * 1024 * 2, // 2MB
  LOCATION_TIMEOUT: 10000, // 10 seconds
  SYNC_INTERVAL: 30000, // 30 seconds
  CAMERA_CONSTRAINTS: {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    }
  },
  GEOFENCE: {
    enabled: false,
    radius: 100, // meters
    center: { lat: -6.2088, lng: 106.8456 } // Jakarta example
  }
};

// ========================================
// STATE MANAGEMENT
// ========================================
class AppState {
  constructor() {
    this.currentUser = null;
    this.streamInstance = null;
    this.attendanceType = 'masuk';
    this.photoData = null;
    this.location = null;
    this.isOnline = navigator.onLine;
    this.todayRecords = [];
    this.isCameraActive = false;
    this.isProcessing = false;
  }

  reset() {
    this.photoData = null;
    this.attendanceType = 'masuk';
    if (this.streamInstance) {
      this.streamInstance.getTracks().forEach(track => track.stop());
      this.streamInstance = null;
    }
    this.isCameraActive = false;
    this.isProcessing = false;
  }
}

const state = new AppState();

// ========================================
// DOM ELEMENTS
// ========================================
const DOM = {
  // Video elements
  video: document.getElementById('video'),
  videoPlaceholder: document.getElementById('video-placeholder'),
  canvasCapture: document.getElementById('canvas-capture'),
  canvasHidden: document.getElementById('canvas-hidden'),
  captureOverlay: document.getElementById('capture-overlay'),
  cameraIndicator: document.getElementById('camera-indicator'),
  
  // Buttons
  startBtn: document.getElementById('start-btn'),
  captureBtn: document.getElementById('capture-btn'),
  submitBtn: document.getElementById('submit-btn'),
  resetBtn: document.getElementById('reset-btn'),
  
  // Status & Info
  statusMessage: document.getElementById('status-message'),
  locationInfo: document.getElementById('location-info'),
  locationText: document.getElementById('location-text'),
  connectionStatus: document.getElementById('connection-status'),
  currentTime: document.getElementById('current-time'),
  
  // User info
  userInfo: document.getElementById('user-info'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  
  // History
  historyContainer: document.getElementById('history-container'),
  emptyHistory: document.getElementById('empty-history'),
  
  // Attendance type
  attendanceType: document.getElementById('attendance-type'),
  
  // Modals
  successModal: document.getElementById('success-modal'),
  
  // Info box
  infoBox: document.getElementById('info-box')
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
const Utils = {
  // Text to speech
  speak(text, lang = 'id-ID') {
    if (!window.speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  },
  
  // Update status with animation
  updateStatus(message, type = 'info', speak = false) {
    const icons = {
      success: '<i class="fas fa-check-circle mr-2 text-green-400"></i>',
      error: '<i class="fas fa-exclamation-circle mr-2 text-red-400"></i>',
      warning: '<i class="fas fa-exclamation-triangle mr-2 text-yellow-400"></i>',
      loading: '<i class="fas fa-circle-notch fa-spin mr-2 text-indigo-400"></i>',
      info: '<i class="fas fa-info-circle mr-2 text-blue-400"></i>'
    };
    
    const colors = {
      success: 'text-green-300',
      error: 'text-red-300',
      warning: 'text-yellow-300',
      loading: 'text-indigo-300',
      info: 'text-blue-300'
    };
    
    DOM.statusMessage.className = `${colors[type]} flex items-center`;
    DOM.statusMessage.innerHTML = icons[type] + message;
    
    if (speak) this.speak(message);
    
    // Auto hide success/error messages
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (DOM.statusMessage.innerHTML.includes(message)) {
          this.updateStatus('Sistem siap', 'info');
        }
      }, 5000);
    }
  },
  
  // Format date/time
  formatDateTime(date) {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  },
  
  // Calculate distance between coordinates
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
  },
  
  // Compress image
  async compressImage(dataURL, maxSize = CONFIG.MAX_PHOTO_SIZE) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions
        const maxDimension = 1024;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress with quality adjustment
        let quality = CONFIG.PHOTO_QUALITY;
        let compressedDataURL = canvas.toDataURL('image/jpeg', quality);
        
        // Further compress if still too large
        while (compressedDataURL.length > maxSize && quality > 0.1) {
          quality -= 0.1;
          compressedDataURL = canvas.toDataURL('image/jpeg', quality);
        }
        
        resolve(compressedDataURL);
      };
      img.src = dataURL;
    });
  },
  
  // Vibrate device
  vibrate(pattern = [200]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  },
  
  // Show notification
  showNotification(title, body, icon = '/icon-192.png') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon });
    }
  }
};

// ========================================
// AUTHENTICATION MODULE
// ========================================
const AuthModule = {
  async initialize() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await this.handleUserLogin(user);
      } else {
        await this.handleAnonymousLogin();
      }
    });
  },
  
  async handleUserLogin(user) {
    state.currentUser = user;
    
    // Update UI
    DOM.userInfo.classList.remove('hidden');
    DOM.userName.textContent = user.displayName || user.email?.split('@')[0] || 'User';
    DOM.userEmail.textContent = user.email || `ID: ${user.uid.slice(-6)}`;
    DOM.startBtn.disabled = false;
    
    // Load user data
    await this.loadUserPreferences();
    await AttendanceModule.checkTodayStatus();
    HistoryModule.loadTodayHistory();
    
    Utils.updateStatus('Sistem siap digunakan', 'success', true);
  },
  
  async handleAnonymousLogin() {
    try {
      Utils.updateStatus('Melakukan login otomatis...', 'loading');
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Auth error:', error);
      Utils.updateStatus('Gagal login. Silakan refresh halaman.', 'error');
    }
  },
  
  async loadUserPreferences() {
    // Load user preferences from Firestore or localStorage
    const prefs = localStorage.getItem(`prefs_${state.currentUser.uid}`);
    if (prefs) {
      const parsed = JSON.parse(prefs);
      // Apply preferences
      if (parsed.enableSound !== undefined) {
        CONFIG.ENABLE_SOUND = parsed.enableSound;
      }
    }
  },
  
  async logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
      await signOut(auth);
      window.location.href = 'index.html';
    }
  }
};

// ========================================
// GEOLOCATION MODULE
// ========================================
const LocationModule = {
  async getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation tidak didukung'));
        return;
      }
      
      const options = {
        enableHighAccuracy: true,
        timeout: CONFIG.LOCATION_TIMEOUT,
        maximumAge: 0
      };
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          
          state.location = {
            lat: latitude,
            lng: longitude,
            accuracy: accuracy
          };
          
          // Reverse geocoding
          try {
            const address = await this.reverseGeocode(latitude, longitude);
            state.location.address = address;
            state.location.city = address.city || address.town || 'Unknown';
            
            DOM.locationInfo.classList.remove('hidden');
            DOM.locationText.textContent = `${state.location.city} (±${Math.round(accuracy)}m)`;
            
            // Check geofencing if enabled
            if (CONFIG.GEOFENCE.enabled) {
              const distance = Utils.calculateDistance(
                latitude, longitude,
                CONFIG.GEOFENCE.center.lat, CONFIG.GEOFENCE.center.lng
              );
              
              if (distance > CONFIG.GEOFENCE.radius) {
                throw new Error(`Anda berada ${Math.round(distance)}m dari lokasi yang diizinkan`);
              }
            }
            
            resolve(state.location);
          } catch (error) {
            state.location.city = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            DOM.locationText.textContent = state.location.city;
            resolve(state.location);
          }
        },
        (error) => {
          let errorMessage = 'Gagal mendapatkan lokasi';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Akses lokasi ditolak. Mohon izinkan akses lokasi.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Informasi lokasi tidak tersedia';
              break;
            case error.TIMEOUT:
              errorMessage = 'Timeout mendapatkan lokasi';
              break;
          }
          reject(new Error(errorMessage));
        },
        options
      );
    });
  },
  
  async reverseGeocode(lat, lng) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { 
          headers: { 'User-Agent': 'AttendanceApp/1.0' },
          timeout: 5000 
        }
      );
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      return data.address || {};
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return {};
    }
  }
};

// ========================================
// CAMERA MODULE
// ========================================
const CameraModule = {
  async start() {
    try {
      if (state.streamInstance) {
        this.stop();
      }
      
      Utils.updateStatus('Mengaktifkan kamera...', 'loading');
      
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA_CONSTRAINTS);
      
      state.streamInstance = stream;
      state.isCameraActive = true;
      
      DOM.video.srcObject = stream;
      DOM.video.style.display = 'block';
      DOM.videoPlaceholder.style.display = 'none';
      DOM.cameraIndicator.classList.remove('hidden');
      
      // Update buttons
      DOM.startBtn.classList.add('hidden');
      DOM.captureBtn.classList.remove('hidden');
      DOM.attendanceType.classList.remove('hidden');
      DOM.infoBox.classList.remove('hidden');
      
      Utils.updateStatus('Kamera aktif, silakan ambil foto', 'success');
      Utils.speak('Kamera aktif, silakan ambil foto');
      
      // Auto-detect face (optional)
      this.startFaceDetection();
      
    } catch (error) {
      console.error('Camera error:', error);
      let errorMessage = 'Gagal mengakses kamera';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Akses kamera ditolak. Mohon izinkan akses kamera.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'Kamera tidak ditemukan';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Kamera sedang digunakan aplikasi lain';
      }
      
      Utils.updateStatus(errorMessage, 'error', true);
    }
  },
  
  stop() {
    if (state.streamInstance) {
      state.streamInstance.getTracks().forEach(track => track.stop());
      state.streamInstance = null;
    }
    state.isCameraActive = false;
    DOM.video.srcObject = null;
    DOM.cameraIndicator.classList.add('hidden');
  },
  
  capture() {
    if (!state.isCameraActive) {
      Utils.updateStatus('Kamera tidak aktif', 'error');
      return;
    }
    
    // Flash effect
    DOM.captureOverlay.style.opacity = '1';
    setTimeout(() => { DOM.captureOverlay.style.opacity = '0'; }, 200);
    
    // Play sound effect
    this.playShutterSound();
    
    // Vibrate
    Utils.vibrate([50]);
    
    // Capture to canvas
    const ctx = DOM.canvasHidden.getContext('2d');
    DOM.canvasHidden.width = DOM.video.videoWidth;
    DOM.canvasHidden.height = DOM.video.videoHeight;
    ctx.drawImage(DOM.video, 0, 0);
    
    // Show captured image
    DOM.canvasCapture.width = DOM.video.videoWidth;
    DOM.canvasCapture.height = DOM.video.videoHeight;
    const ctxCapture = DOM.canvasCapture.getContext('2d');
    ctxCapture.drawImage(DOM.video, 0, 0);
    
    DOM.canvasCapture.style.display = 'block';
    DOM.video.style.display = 'none';
    
    // Get photo data
    state.photoData = DOM.canvasHidden.toDataURL('image/jpeg', CONFIG.PHOTO_QUALITY);
    
    // Stop camera
    this.stop();
    
    // Update UI
    DOM.captureBtn.classList.add('hidden');
    DOM.submitBtn.classList.remove('hidden');
    DOM.resetBtn.classList.remove('hidden');
    
    Utils.updateStatus('Foto berhasil diambil', 'success', true);
  },
  
  playShutterSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    audio.play().catch(() => {});
  },
  
  startFaceDetection() {
    // Optional: Implement face detection using face-api.js or similar
    // This can help ensure face is properly positioned
  }
};

// ========================================
// ATTENDANCE MODULE
// ========================================
const AttendanceModule = {
  async checkTodayStatus() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const q = query(
        collection(db, getCollectionPath()),
        where('userId', '==', state.currentUser.uid),
        where('timestamp', '>=', Timestamp.fromDate(today)),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const lastRecord = snapshot.docs[0].data();
        if (lastRecord.type === 'masuk') {
          state.attendanceType = 'pulang';
          DOM.startBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Mulai Absen Pulang';
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  },
  
  async submit() {
    if (!state.photoData) {
      Utils.updateStatus('Silakan ambil foto terlebih dahulu', 'error', true);
      return;
    }
    
    if (!state.location) {
      Utils.updateStatus('Lokasi belum tersedia', 'error', true);
      return;
    }
    
    state.isProcessing = true;
    DOM.submitBtn.disabled = true;
    Utils.updateStatus('Mengirim data absensi...', 'loading');
    
    try {
      // Compress photo
      const compressedPhoto = await Utils.compressImage(state.photoData);
      
      // Upload to Firebase Storage
      const photoURL = await this.uploadPhoto(compressedPhoto);
      
      // Prepare attendance data
      const attendanceData = {
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName || state.currentUser.email || 'Guest',
        userEmail: state.currentUser.email || null,
        type: state.attendanceType,
        status: 'hadir',
        timestamp: serverTimestamp(),
        photoURL: photoURL,
        photoBase64: compressedPhoto, // Keep for backward compatibility
        location: {
          lat: state.location.lat,
          lng: state.location.lng,
          accuracy: state.location.accuracy,
          city: state.location.city,
          address: state.location.address
        },
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          online: navigator.onLine
        },
        metadata: {
          appVersion: '2.0',
          submittedAt: new Date().toISOString()
        }
      };
      
      // Save to Firestore
      const docRef = await addDoc(collection(db, getCollectionPath()), attendanceData);
      
      console.log('Attendance saved:', docRef.id);
      
      // Success handling
      this.handleSuccess();
      
      // Update state
      if (state.attendanceType === 'masuk') {
        state.attendanceType = 'pulang';
        DOM.startBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Mulai Absen Pulang';
      } else {
        state.attendanceType = 'masuk';
        DOM.startBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Mulai Absen Masuk';
      }
      
    } catch (error) {
      console.error('Submit error:', error);
      this.handleError(error);
      
      // Save offline if network error
      if (!navigator.onLine) {
        await OfflineModule.saveAttendance(attendanceData);
        Utils.updateStatus('Disimpan offline, akan dikirim saat online', 'warning', true);
      }
      
    } finally {
      state.isProcessing = false;
      DOM.submitBtn.disabled = false;
    }
  },
  
  async uploadPhoto(dataURL) {
    try {
      // Convert dataURL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      // Create unique filename
      const fileName = `attendance/${state.currentUser.uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);
      
      // Upload to storage
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
        customMetadata: {
          userId: state.currentUser.uid,
          type: state.attendanceType,
          timestamp: new Date().toISOString()
        }
      });
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
      
    } catch (error) {
      console.error('Photo upload error:', error);
      // Return base64 as fallback
      return dataURL;
    }
  },
  
  handleSuccess() {
    Utils.updateStatus('Absensi berhasil disimpan!', 'success', true);
    Utils.showNotification('Absensi Berhasil', `Absensi ${state.attendanceType} berhasil dicatat`);
    Utils.vibrate([100, 50, 100]);
    
    // Show success modal
    DOM.successModal.classList.remove('hidden');
    setTimeout(() => {
      DOM.successModal.classList.add('hidden');
    }, 3000);
    
    // Reset after delay
    setTimeout(() => {
      UIModule.reset();
    }, 2000);
  },
  
  handleError(error) {
    let errorMessage = 'Gagal menyimpan absensi';
    
    if (error.code === 'permission-denied') {
      errorMessage = 'Tidak memiliki izin untuk menyimpan data';
    } else if (error.code === 'unavailable') {
      errorMessage = 'Server tidak tersedia, coba lagi nanti';
    }
    
    Utils.updateStatus(errorMessage, 'error', true);
    Utils.vibrate([300]);
  }
};

// ========================================
// HISTORY MODULE
// ========================================
const HistoryModule = {
  loadTodayHistory() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, getCollectionPath()),
      where('userId', '==', state.currentUser.uid),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      orderBy('timestamp', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        DOM.historyContainer.style.display = 'none';
        DOM.emptyHistory.style.display = 'block';
        state.todayRecords = [];
        return;
      }
      
      DOM.historyContainer.style.display = 'block';
      DOM.emptyHistory.style.display = 'none';
      
      state.todayRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));
      
      this.renderHistory();
    });
  },
  
  renderHistory() {
    DOM.historyContainer.innerHTML = state.todayRecords.map(record => {
      const time = record.timestamp.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const icon = record.type === 'masuk' 
        ? '<i class="fas fa-sign-in-alt text-green-400"></i>'
        : '<i class="fas fa-sign-out-alt text-yellow-400"></i>';
      
      const typeText = record.type === 'masuk' ? 'Masuk' : 'Pulang';
      const location = record.location?.city || 'Unknown';
      
      return `
        <div class="bg-slate-800 rounded-lg p-3 flex items-center justify-between hover:bg-slate-700 transition cursor-pointer"
             onclick="HistoryModule.showDetail('${record.id}')">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-green-500 bg-opacity-20 flex items-center justify-center">
              ${icon}
            </div>
            <div>
              <p class="text-sm font-semibold text-white">${typeText}</p>
              <p class="text-xs text-gray-400">${time}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500">${location}</p>
            ${record.synced === false ? '<i class="fas fa-cloud-upload-alt text-yellow-400 text-xs"></i>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },
  
  showDetail(recordId) {
    const record = state.todayRecords.find(r => r.id === recordId);
    if (!record) return;
    
    // Show detail modal or expand card
    console.log('Show detail for:', record);
    // Implement detail view
  },
  
  async exportToday() {
    if (state.todayRecords.length === 0) {
      Utils.updateStatus('Tidak ada data untuk diexport', 'warning');
      return;
    }
    
    const csv = this.convertToCSV(state.todayRecords);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
    Utils.updateStatus('Data berhasil diexport', 'success');
  },
  
  convertToCSV(records) {
    const headers = ['Waktu', 'Tipe', 'Lokasi', 'Status'];
    const rows = records.map(r => [
      r.timestamp.toLocaleString('id-ID'),
      r.type,
      r.location?.city || '-',
      r.status || 'hadir'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
};

// ========================================
// OFFLINE MODULE
// ========================================
const OfflineModule = {
  STORAGE_KEY: 'offline_attendance',
  
  async saveAttendance(data) {
    try {
      const offlineData = this.getOfflineData();
      offlineData.push({
        ...data,
        id: `offline_${Date.now()}`,
        synced: false
      });
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(offlineData));
      console.log('Saved offline:', offlineData.length, 'records');
      
    } catch (error) {
      console.error('Failed to save offline:', error);
    }
  },
  
  getOfflineData() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  
  async syncOfflineData() {
    if (!navigator.onLine || !state.currentUser) return;
    
    const offlineData = this.getOfflineData();
    if (offlineData.length === 0) return;
    
    console.log('Syncing', offlineData.length, 'offline records...');
    Utils.updateStatus('Sinkronisasi data offline...', 'loading');
    
    let synced = 0;
    const failed = [];
    
    for (const record of offlineData) {
      try {
        delete record.id;
        delete record.synced;
        
        await addDoc(collection(db, getCollectionPath()), {
          ...record,
          timestamp: serverTimestamp(),
          syncedAt: serverTimestamp()
        });
        
        synced++;
      } catch (error) {
        console.error('Failed to sync record:', error);
        failed.push(record);
      }
    }
    
    // Update storage
    if (failed.length > 0) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(failed));
      Utils.updateStatus(`${synced} data berhasil disinkronkan, ${failed.length} gagal`, 'warning');
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
      Utils.updateStatus(`${synced} data berhasil disinkronkan`, 'success');
    }
  }
};

// ========================================
// UI MODULE
// ========================================
const UIModule = {
  initialize() {
    this.setupEventListeners();
    this.setupClock();
    this.setupConnectionMonitor();
    this.checkNotificationPermission();
    this.loadTheme();
  },
  
  setupEventListeners() {
    // Button handlers
    DOM.startBtn.addEventListener('click', this.handleStart.bind(this));
    DOM.captureBtn.addEventListener('click', this.handleCapture.bind(this));
    DOM.submitBtn.addEventListener('click', this.handleSubmit.bind(this));
    DOM.resetBtn.addEventListener('click', this.reset.bind(this));
    
    // Window events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.isCameraActive) {
        CameraModule.stop();
      }
    });
    
    // Prevent accidental navigation
    window.addEventListener('beforeunload', (e) => {
      if (state.isProcessing) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },
  
  async handleStart() {
    try {
      // Get location first
      await LocationModule.getCurrentLocation();
      
      // Start camera
      await CameraModule.start();
      
    } catch (error) {
      console.error('Start error:', error);
      Utils.updateStatus(error.message, 'error', true);
    }
  },
  
  handleCapture() {
    CameraModule.capture();
  },
  
  async handleSubmit() {
    await AttendanceModule.submit();
  },
  
  reset() {
    state.reset();
    
    // Reset UI elements
    DOM.video.style.display = 'none';
    DOM.canvasCapture.style.display = 'none';
    DOM.videoPlaceholder.style.display = 'flex';
    
    DOM.startBtn.classList.remove('hidden');
    DOM.captureBtn.classList.add('hidden');
    DOM.submitBtn.classList.add('hidden');
    DOM.resetBtn.classList.add('hidden');
    DOM.attendanceType.classList.add('hidden');
    DOM.infoBox.classList.add('hidden');
    
    Utils.updateStatus('Sistem siap digunakan', 'info');
  },
  
  setupClock() {
    const updateTime = () => {
      const now = new Date();
      DOM.currentTime.textContent = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  },
  
  setupConnectionMonitor() {
    const updateStatus = () => {
      state.isOnline = navigator.onLine;
      
      if (navigator.onLine) {
        DOM.connectionStatus.innerHTML = 
          '<i class="fas fa-wifi text-green-400 mr-1"></i><span class="text-gray-400">Online</span>';
      } else {
        DOM.connectionStatus.innerHTML = 
          '<i class="fas fa-wifi-slash text-red-400 mr-1"></i><span class="text-gray-400">Offline</span>';
      }
    };
    
    updateStatus();
    setInterval(updateStatus, 5000);
  },
  
  handleOnline() {
    state.isOnline = true;
    Utils.updateStatus('Koneksi internet tersambung', 'success');
    OfflineModule.syncOfflineData();
  },
  
  handleOffline() {
    state.isOnline = false;
    Utils.updateStatus('Koneksi internet terputus', 'warning');
  },
  
  checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
  
  loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.className = theme;
  }
};

// ========================================
// SERVICE WORKER
// ========================================
const ServiceWorkerModule = {
  async register() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered:', registration);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              Utils.updateStatus('Update tersedia! Refresh untuk mendapatkan versi terbaru.', 'info');
            }
          });
        });
        
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }
};

// ========================================
// GLOBAL FUNCTIONS (for HTML onclick)
// ========================================
window.setAttendanceType = function(type) {
  state.attendanceType = type;
  
  // Update UI
  document.querySelectorAll('.attendance-type-btn').forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white');
    btn.classList.add('bg-gray-700', 'text-gray-300');
  });
  
  const selectedBtn = document.querySelector(`[data-type="${type}"]`);
  if (selectedBtn) {
    selectedBtn.classList.remove('bg-gray-700', 'text-gray-300');
    selectedBtn.classList.add('bg-indigo-600', 'text-white');
  }
  
  Utils.speak(`Absensi ${type} dipilih`);
};

window.closeSuccessModal = function() {
  DOM.successModal.classList.add('hidden');
};

window.refreshHistory = function() {
  HistoryModule.loadTodayHistory();
  const btn = event.target.closest('button');
  btn.classList.add('animate-spin');
  setTimeout(() => btn.classList.remove('animate-spin'), 1000);
};

// ========================================
// APP INITIALIZATION
// ========================================
class AttendanceApp {
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('🚀 Initializing Attendance App...');
      
      // Register service worker
      await ServiceWorkerModule.register();
      
      // Initialize UI
      UIModule.initialize();
      
      // Initialize authentication
      await AuthModule.initialize();
      
      // Start periodic sync
      setInterval(() => {
        if (navigator.onLine) {
          OfflineModule.syncOfflineData();
        }
      }, CONFIG.SYNC_INTERVAL);
      
      this.initialized = true;
      console.log('✅ App initialized successfully');
      
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      Utils.updateStatus('Gagal menginisialisasi aplikasi', 'error');
    }
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new AttendanceApp();
    app.initialize();
  });
} else {
  const app = new AttendanceApp();
  app.initialize();
}

// Export for debugging
window.__APP_STATE__ = state;
window.__APP_CONFIG__ = CONFIG;
