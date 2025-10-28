// js/employee-app.js
import { app, auth, db, getCollectionPath } from '../firebase-config.js';
import { 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// --- DOM Elements ---
const video = document.getElementById('video');
const videoPlaceholder = document.getElementById('video-placeholder');
const canvasCapture = document.getElementById('canvas-capture');
const canvasHidden = document.getElementById('canvas-hidden');
const startBtn = document.getElementById('start-btn');
const captureBtn = document.getElementById('capture-btn');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const statusMessage = document.getElementById('status-message');
const locationMessage = document.getElementById('location-message');
const userStatus = document.getElementById('user-status');
const historyContainer = document.getElementById('history-container');
const offlineStatus = document.getElementById('offline-status');

let currentUserId = null; 
let streamInstance = null;
let isClockedIn = false;
let attendanceData = { locationName: null, latitude: null, longitude: null };

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(
    reg => console.log('✅ Service Worker terdaftar:', reg),
    err => console.log('❌ Gagal daftar SW:', err)
  );
}

// --- Helper functions ---
function speak(text) {
  try {
    const s = new SpeechSynthesisUtterance(text);
    s.lang = 'id-ID';
    window.speechSynthesis.speak(s);
  } catch {}
}
function updateStatus(msg, voice = true) {
  console.log(msg);
  statusMessage.textContent = msg;
  if (voice) speak(msg);
}

// --- Authentication ---
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      userStatus.textContent = `UserID: ...${user.uid.slice(-6)}`;
      startBtn.disabled = false;
      await checkClockStatus(user.uid);
      loadUserHistory(user.uid);
      updateStatus(`Terhubung sebagai ${user.uid.slice(-4)}. Siap untuk ${isClockedIn ? 'Absen Pulang' : 'Absen Masuk'}`);
    } else {
      currentUserId = null;
      userStatus.textContent = "Belum login";
      startBtn.disabled = true;
    }
  });
  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token)
      await signInWithCustomToken(auth, __initial_auth_token);
    else
      await signInAnonymously(auth);
  } catch (e) {
    updateStatus("Gagal autentikasi. Refresh halaman.");
  }
}

// --- Check last attendance ---
async function checkClockStatus(userId) {
  const q = query(collection(db, getCollectionPath()), where("userId", "==", userId));
  const snapshot = await new Promise((resolve) => {
    const unsub = onSnapshot(q, (snap) => { resolve(snap); unsub(); });
  });
  if (snapshot.empty) return isClockedIn = false;
  const records = snapshot.docs.map(d => ({
    ...d.data(),
    timestamp: d.data().timestamp?.toDate?.() || new Date(0)
  })).sort((a, b) => b.timestamp - a.timestamp);
  const latest = records[0];
  const today = new Date();
  isClockedIn = latest.timestamp.toDateString() === today.toDateString() && latest.type === 'IN';
  startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
}

// --- Load history ---
function loadUserHistory(userId) {
  const q = query(collection(db, getCollectionPath()), where("userId", "==", userId));
  onSnapshot(q, (snap) => {
    if (snap.empty) return historyContainer.innerHTML = '<p>Belum ada riwayat absensi.</p>';
    const data = snap.docs.map(d => ({
      ...d.data(),
      id: d.id,
      timestamp: d.data().timestamp?.toDate?.() || new Date(0)
    })).sort((a, b) => b.timestamp - a.timestamp);
    historyContainer.innerHTML = data.slice(0, 5).map(r => `
      <div class="flex justify-between border-b border-gray-800 py-2">
        <span class="${r.type === 'IN' ? 'text-green-400' : 'text-yellow-400'} font-bold">${r.type}</span>
        <span>${r.timestamp.toLocaleString('id-ID')}</span>
        <span class="text-gray-500">${r.locationName}</span>
      </div>`).join('');
  });
}

// --- Geolocation ---
async function getLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Geolokasi tidak didukung"));
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        const locName = `Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`;
        attendanceData = { locationName: locName, latitude, longitude };
        locationMessage.textContent = locName;
        res(locName);
      },
      err => rej(err),
      { enableHighAccuracy: true }
    );
  });
}

// --- Camera ---
async function startCamera() {
  if (streamInstance) streamInstance.getTracks().forEach(t => t.stop());
  streamInstance = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }});
  video.srcObject = streamInstance;
  videoPlaceholder.classList.add('hidden');
}

// --- Capture photo ---
function capturePhoto() {
  const ctx = canvasHidden.getContext('2d');
  canvasHidden.width = video.videoWidth;
  canvasHidden.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  captureBtn.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  video.classList.add('hidden');
  streamInstance?.getTracks().forEach(t => t.stop());
}

// --- Submit attendance ---
async function submitAttendance() {
  const photoBase64 = canvasHidden.toDataURL('image/jpeg', 0.2);
  const type = isClockedIn ? 'OUT' : 'IN';
  const data = {
    userId: currentUserId,
    type,
    locationName: attendanceData.locationName,
    coordinates: {
      latitude: attendanceData.latitude,
      longitude: attendanceData.longitude
    },
    photoBase64,
    timestamp: new Date()
  };
  try {
    await addDoc(collection(db, getCollectionPath()), { ...data, timestamp: serverTimestamp() });
    updateStatus(`Absensi ${type} berhasil dikirim!`);
    isClockedIn = !isClockedIn;
  } catch (err) {
    console.error("Gagal kirim absensi:", err);
    updateStatus("Gagal mengirim absensi. Periksa koneksi internet.");
  }
  submitBtn.classList.add('hidden');
  resetBtn.classList.remove('hidden');
}

// --- Sync offline data (dinonaktifkan) ---
async function syncData() {
  console.log("Sinkronisasi offline dinonaktifkan (tidak pakai storage-firebase.js)");
}

// --- Reset UI ---
function resetUI() {
  startBtn.classList.remove('hidden');
  resetBtn.classList.add('hidden');
  submitBtn.classList.add('hidden');
  captureBtn.classList.add('hidden');
  videoPlaceholder.classList.remove('hidden');
  startBtn.disabled = false;
  startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
}

// --- Event handlers ---
startBtn.addEventListener('click', async () => {
  await getLocation();
  await startCamera();
  startBtn.classList.add('hidden');
  captureBtn.classList.remove('hidden');
});
captureBtn.addEventListener('click', capturePhoto);
submitBtn.addEventListener('click', submitAttendance);
resetBtn.addEventListener('click', resetUI);
window.addEventListener('online', () => offlineStatus.classList.add('hidden'));
window.addEventListener('offline', () => offlineStatus.classList.remove('hidden'));

// --- Inisialisasi utama ---
handleAuth();
