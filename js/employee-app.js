// js/employee-app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithEmailAndPassword,
    onAuthStateChanged, 
    setPersistence,
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    where, 
    onSnapshot,
    orderBy,
    limit,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { firebaseConfig, getCollectionPath } from '../firebase-config.js';
import { saveToIndexedDB, getPendingSubmissions, deleteSubmission } from '../storage-firebase.js';

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

// --- Initialize Firebase ---
let app, analytics, auth, db;
let currentUserId = null; 
let currentUserEmail = null;
let streamInstance = null;
let isClockedIn = false;

let attendanceData = {
    locationName: null,
    latitude: null,
    longitude: null,
};

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(
            registration => console.log('SW registered: ', registration),
            err => console.log('SW registration failed: ', err)
        );
    });
}

// --- Helper Functions ---
function speak(text) {
    try {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    } catch (error) { 
        console.log('Speech synthesis not available');
    }
}

function updateStatus(message, useVoice = true) {
    console.log("Status:", message);
    statusMessage.textContent = message;
    if (useVoice) {
        speak(message);
    }
}

// --- Initialize App ---
async function initApp() {
    try {
        app = initializeApp(firebaseConfig);
        analytics = getAnalytics(app);
        auth = getAuth(app);
        db = getFirestore(app);
        
        // Set persistence to local
        await setPersistence(auth, browserLocalPersistence);
        
        await handleAuthentication();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        updateStatus("Gagal terhubung ke server. Silakan refresh.", true);
    }
}

// --- Authentication ---
async function handleAuthentication() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            currentUserEmail = user.email || 'Anonymous';
            userStatus.textContent = `User: ${currentUserEmail}`;
            startBtn.disabled = false;
            
            await checkClockStatus(currentUserId);
            loadUserHistory(currentUserId);
            syncData();

            updateStatus(`Selamat datang ${currentUserEmail}. Siap untuk ${isClockedIn ? 'Absen Pulang' : 'Absen Masuk'}`, true);
            
        } else {
            // If not authenticated, try anonymous sign in
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous Auth Error:", error);
                currentUserId = null;
                userStatus.textContent = "Not Authenticated";
                startBtn.disabled = true;
                updateStatus("Autentikasi gagal. Mohon refresh.", true);
            }
        }
    });
}

// --- Clock Status Check ---
async function checkClockStatus(userId) {
    const absensiRef = collection(db, getCollectionPath());
    
    try {
        // Get today's start time
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const q = query(
            absensiRef, 
            where("userId", "==", userId),
            orderBy("timestamp", "desc"),
            limit(1)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const latestDoc = snapshot.docs[0];
            const latestData = latestDoc.data();
            const latestTimestamp = latestData.timestamp ? latestData.timestamp.toDate() : new Date(0);
            
            // Check if the latest record is from today
            if (latestTimestamp >= today) {
                isClockedIn = latestData.type === 'IN';
            } else {
                isClockedIn = false;
            }
        } else {
            isClockedIn = false;
        }
    } catch(e) {
        console.error("Error checking clock status:", e);
        // If there's an index error, fallback to simpler query
        try {
            const q = query(
                absensiRef, 
                where("userId", "==", userId)
            );
            
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                // Sort locally
                const records = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date(0)
                })).sort((a, b) => b.timestamp - a.timestamp);
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (records[0] && records[0].timestamp >= today) {
                    isClockedIn = records[0].type === 'IN';
                } else {
                    isClockedIn = false;
                }
            } else {
                isClockedIn = false;
            }
        } catch(fallbackError) {
            console.error("Fallback query also failed:", fallbackError);
            isClockedIn = false;
        }
    }

    startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
}

// --- Location Services ---
async function getLocation() {
    updateStatus("Mendapatkan lokasi Anda...");
    locationMessage.textContent = "Memproses GPS...";

    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation tidak didukung browser Anda."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                
                try {
                    // Try to get location name from reverse geocoding
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
                        {
                            headers: {
                                'User-Agent': 'AttendanceApp/1.0'
                            }
                        }
                    );
                    
                    if (response.ok) {
                        const data = await response.json();
                        const locationName = data.display_name || `${latitude}, ${longitude}`;
                        
                        attendanceData = { 
                            locationName: locationName.substring(0, 100), // Limit length
                            latitude, 
                            longitude 
                        };
                        
                        updateStatus(`Lokasi berhasil didapat`);
                        locationMessage.textContent = `📍 ${locationName.split(',')[0]}`;
                    } else {
                        // Fallback if geocoding fails
                        attendanceData = { 
                            locationName: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`,
                            latitude, 
                            longitude 
                        };
                        updateStatus(`Lokasi GPS didapat`);
                        locationMessage.textContent = `📍 GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                    }
                    
                    resolve(attendanceData.locationName);
                    
                } catch (apiError) {
                    // Use coordinates as location name if API fails
                    attendanceData = { 
                        locationName: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`,
                        latitude, 
                        longitude 
                    };
                    updateStatus(`Lokasi GPS didapat`);
                    locationMessage.textContent = `📍 GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                    resolve(attendanceData.locationName);
                }
            },
            (error) => {
                let errorMessage = "Tidak dapat mengakses lokasi.";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Akses lokasi ditolak. Mohon izinkan akses lokasi.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Informasi lokasi tidak tersedia.";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "Timeout saat mendapatkan lokasi.";
                        break;
                }
                reject(new Error(errorMessage));
            },
            { 
                enableHighAccuracy: true, 
                timeout: 10000, 
                maximumAge: 0 
            }
        );
    });
}

// --- Camera Functions ---
async function startCamera() {
    updateStatus("Mengaktifkan kamera...");
    try {
        if (streamInstance) {
            streamInstance.getTracks().forEach(track => track.stop());
        }
        
        // Try to get user-facing camera first, fallback to any camera
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        try {
            streamInstance = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            // Fallback to any available camera
            streamInstance = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        video.srcObject = streamInstance;
        video.classList.remove('hidden');
        videoPlaceholder.classList.add('hidden');
        canvasCapture.classList.add('hidden');
        
        updateStatus("Posisikan wajah Anda di tengah dan ambil foto.");

    } catch (error) {
        console.error("Kamera Error:", error);
        throw new Error("Gagal mengakses kamera. Pastikan Anda memberi izin.");
    }
}

function capturePhoto() {
    updateStatus("Foto berhasil diambil!", true);

    const context = canvasHidden.getContext('2d');
    const captureContext = canvasCapture.getContext('2d');

    // Set canvas sizes
    canvasHidden.width = video.videoWidth;
    canvasHidden.height = video.videoHeight;
    canvasCapture.width = video.clientWidth;
    canvasCapture.height = video.clientHeight;

    // Draw video frame to canvases
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    captureContext.drawImage(video, 0, 0, canvasCapture.width, canvasCapture.height);

    // Show captured image, hide video
    video.classList.add('hidden');
    canvasCapture.classList.remove('hidden');

    // Stop camera stream
    if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
        streamInstance = null;
    }

    // Update buttons
    captureBtn.classList.add('hidden');
    submitBtn.classList.remove('hidden');
}

// --- Submit Functions ---
async function submitDataToFirestore(dataToSend) {
    if (!navigator.onLine) {
         throw new Error("Tidak ada koneksi internet.");
    }
    if (!db) {
        throw new Error("Firebase DB belum terinisialisasi.");
    }

    const collectionPath = getCollectionPath();
    const docRef = await addDoc(collection(db, collectionPath), {
        ...dataToSend,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString() // Backup timestamp
    });
    return docRef;
}

async function submitAttendance() {
    if (!currentUserId || !attendanceData.locationName) {
        updateStatus("Error: Data tidak lengkap. Coba lagi.", true);
        return;
    }

    updateStatus("Mengirim data absensi...", true);
    submitBtn.disabled = true;
    submitBtn.textContent = "Memproses...";

    try {
        // Convert photo to base64 with compression
        const photoBase64 = canvasHidden.toDataURL('image/jpeg', 0.3); 
        const type = isClockedIn ? 'OUT' : 'IN';

        const docData = {
            userId: currentUserId,
            userEmail: currentUserEmail,
            type: type,
            locationName: attendanceData.locationName,
            coordinates: {
                latitude: attendanceData.latitude,
                longitude: attendanceData.longitude
            },
            photoBase64: photoBase64,
            deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            }
        };
        
        // Try to submit online
        await submitDataToFirestore(docData);

        updateStatus(`Absensi ${type} berhasil terkirim. Terima kasih!`, true);
        isClockedIn = !isClockedIn;
        startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
        
        // Reload history
        loadUserHistory(currentUserId);
        
    } catch (error) {
        console.warn("Gagal kirim online:", error.message);
        
        // Save to IndexedDB for offline sync
        try {
            const offlineData = {
                ...docData,
                timestamp: new Date().toISOString()
            };
            await saveToIndexedDB(offlineData);
            updateStatus(`Data disimpan offline. Akan dikirim saat online kembali.`, true);
            document.getElementById('offline-status').classList.remove('hidden');
        } catch (dbError) {
            updateStatus(`Gagal menyimpan data: ${dbError.message}`, true);
        }
    } finally {
        submitBtn.classList.add('hidden');
        resetBtn.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = "Kirim Absensi";
    }
}

// --- Sync Data ---
async function syncData() {
    if (!navigator.onLine) return;
    
    try {
        const pending = await getPendingSubmissions();
        if (pending.length === 0) return;

        updateStatus(`Sinkronisasi ${pending.length} data offline...`, false);

        for (const item of pending) {
            try {
                await submitDataToFirestore(item);
                await deleteSubmission(item.id);
                console.log(`Data ${item.id} berhasil disinkronkan.`);
            } catch (error) {
                console.error(`Gagal sinkronisasi ${item.id}:`, error);
                return; 
            }
        }
        
        updateStatus("Semua data offline berhasil disinkronkan!", true);
        document.getElementById('offline-status').classList.add('hidden');
        if (currentUserId) loadUserHistory(currentUserId);
    } catch (error) {
        console.error("Sync error:", error);
    }
}

// --- User History ---
function loadUserHistory(userId) {
    const absensiRef = collection(db, getCollectionPath());
    
    const q = query(
        absensiRef, 
        where("userId", "==", userId)
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historyContainer.innerHTML = '<p class="text-gray-500">Belum ada riwayat absensi.</p>';
            return;
        }

        // Sort locally by timestamp
        const records = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date(doc.data().createdAt || 0)
        })).sort((a, b) => b.timestamp - a.timestamp);

        // Display last 5 records
        historyContainer.innerHTML = records.slice(0, 5).map(record => {
            const time = record.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const date = record.timestamp.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            const statusClass = record.type === 'IN' ? 'text-green-400' : 'text-yellow-400';
            const statusIcon = record.type === 'IN' ? '🟢' : '🟡';

            return `
                <div class="flex justify-between items-center border-b border-gray-800 py-2">
                    <div class="flex items-center gap-2">
                        <span>${statusIcon}</span>
                        <span class="${statusClass} font-bold">${record.type}</span>
                    </div>
                    <span class="text-gray-400">${date} ${time}</span>
                    <span class="text-gray-500 text-xs truncate max-w-[100px]" title="${record.locationName}">
                        📍 ${record.locationName.split(',')[0]}
                    </span>
                </div>
            `;
        }).join('');
    }, (error) => {
        console.error("Error memuat riwayat:", error);
        historyContainer.innerHTML = '<p class="text-red-400">Gagal memuat riwayat.</p>';
    });
}

// --- Reset UI ---
function resetUI() {
    updateStatus("Silakan mulai absensi baru.", false);
    locationMessage.textContent = "";
    attendanceData = { locationName: null, latitude: null, longitude: null };
    
    canvasCapture.classList.add('hidden');
    videoPlaceholder.classList.remove('hidden');
    
    resetBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    
    if (currentUserId) {
        startBtn.disabled = false;
    }
    
    startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
}

// --- Event Listeners ---
startBtn.addEventListener('click', async () => {
    if (!currentUserId) {
        updateStatus("Harap tunggu, sedang melakukan autentikasi.", true);
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Memproses...";

    const type = isClockedIn ? 'Absen Pulang' : 'Absen Masuk';
    updateStatus(`Memulai proses ${type}...`, true);

    try {
        await getLocation();
        await startCamera();
        
        startBtn.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        captureBtn.textContent = `Ambil Foto ${type}`;
        
    } catch (error) {
        console.error("Proses absensi gagal:", error);
        updateStatus(`Error: ${error.message}`, true);
        startBtn.disabled = false;
        startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
    }
});

captureBtn.addEventListener('click', capturePhoto);
submitBtn.addEventListener('click', submitAttendance);
resetBtn.addEventListener('click', resetUI);

// --- Network Events ---
window.addEventListener('online', () => {
    console.log("Back online");
    offlineStatus.classList.add('hidden');
    syncData();
});

window.addEventListener('offline', () => {
    console.log("Gone offline");
    offlineStatus.classList.remove('hidden');
    updateStatus("Koneksi terputus. Mode offline aktif.", true);
});

// --- Initialize ---
initApp();
