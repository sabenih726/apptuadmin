// js/employee-app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithEmailAndPassword,
    onAuthStateChanged, 
    signOut 
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
        
        console.log("Firebase initialized successfully");
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
            
            // Check for offline data to sync
            if (navigator.onLine) {
                syncData();
            }

            updateStatus(`Terhubung sebagai ${currentUserEmail}. Siap untuk ${isClockedIn ? 'Absen Pulang' : 'Absen Masuk'}`, true);
            
        } else {
            currentUserId = null;
            currentUserEmail = null;
            userStatus.textContent = "Not Authenticated";
            startBtn.disabled = true;
            
            // Try anonymous authentication
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous Auth Error:", error);
                updateStatus("Autentikasi gagal. Mohon refresh.", true);
            }
        }
    });
}

// --- Clock Status Check ---
async function checkClockStatus(userId) {
    try {
        const absensiRef = collection(db, getCollectionPath());
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const q = query(
            absensiRef, 
            where("userId", "==", userId),
            orderBy("timestamp", "desc"),
            limit(1)
        );

        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const latestDoc = querySnapshot.docs[0];
            const latestData = latestDoc.data();
            const latestTimestamp = latestData.timestamp?.toDate() || new Date(0);
            
            // Check if it's from today
            if (latestTimestamp.toDateString() === new Date().toDateString()) {
                isClockedIn = latestData.type === 'IN';
            } else {
                isClockedIn = false;
            }
        } else {
            isClockedIn = false;
        }
    } catch(error) {
        console.error("Error checking clock status:", error);
        // If there's an index error, fallback to simpler query
        try {
            const absensiRef = collection(db, getCollectionPath());
            const q = query(
                absensiRef, 
                where("userId", "==", userId)
            );
            
            const querySnapshot = await getDocs(q);
            const records = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                records.push({
                    ...data,
                    timestamp: data.timestamp?.toDate() || new Date(0)
                });
            });
            
            // Sort locally
            records.sort((a, b) => b.timestamp - a.timestamp);
            
            if (records.length > 0) {
                const latest = records[0];
                if (latest.timestamp.toDateString() === new Date().toDateString()) {
                    isClockedIn = latest.type === 'IN';
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
    locationMessage.textContent = "Memproses...";

    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation tidak didukung browser Anda."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                
                try {
                    // Try reverse geocoding
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    
                    if (!response.ok) throw new Error('Geocoding failed');
                    
                    const data = await response.json();
                    const locationName = data.display_name || `${latitude}, ${longitude}`;
                    
                    attendanceData = { locationName, latitude, longitude };

                    updateStatus(`Lokasi didapat: ${locationName.split(',')[0]}`);
                    locationMessage.textContent = `Lokasi: ${locationName.split(',')[0]}`;
                    resolve(locationName);

                } catch (apiError) {
                    // Fallback to coordinates only
                    const locationName = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                    attendanceData = { locationName, latitude, longitude };
                    updateStatus(`Lokasi: ${locationName}`);
                    locationMessage.textContent = `Koordinat: ${locationName}`;
                    resolve(locationName);
                }
            },
            (error) => {
                reject(new Error(error.message || "Tidak dapat mengakses lokasi."));
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
        
        streamInstance = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        video.srcObject = streamInstance;
        video.classList.remove('hidden');
        videoPlaceholder.classList.add('hidden');
        canvasCapture.classList.add('hidden');
        
        updateStatus("Posisikan wajah Anda dan ambil foto.");

    } catch (error) {
        console.error("Kamera Error:", error);
        throw new Error("Gagal mengakses kamera. Pastikan Anda memberi izin.");
    }
}

function capturePhoto() {
    updateStatus("Foto diambil!", true);

    const context = canvasHidden.getContext('2d');
    const captureContext = canvasCapture.getContext('2d');

    canvasHidden.width = video.videoWidth;
    canvasHidden.height = video.videoHeight;
    canvasCapture.width = video.clientWidth;
    canvasCapture.height = video.clientHeight;

    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    captureContext.drawImage(video, 0, 0, canvasCapture.width, canvasCapture.height);

    video.classList.add('hidden');
    canvasCapture.classList.remove('hidden');

    if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
        streamInstance = null;
    }

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
        
        await submitDataToFirestore(docData);

        updateStatus(`Absensi ${type} berhasil terkirim. Terima kasih!`, true);
        isClockedIn = !isClockedIn;
        startBtn.textContent = isClockedIn ? 'Mulai Absen Pulang' : 'Mulai Absen Masuk';
        
        // Reload history
        loadUserHistory(currentUserId);
        
    } catch (error) {
        console.warn("Gagal kirim online:", error.message);
        
        try {
            const docData = {
                userId: currentUserId,
                userEmail: currentUserEmail,
                type: isClockedIn ? 'OUT' : 'IN',
                locationName: attendanceData.locationName,
                coordinates: {
                    latitude: attendanceData.latitude,
                    longitude: attendanceData.longitude
                },
                photoBase64: canvasHidden.toDataURL('image/jpeg', 0.3),
                createdAt: new Date().toISOString()
            };
            
            await saveToIndexedDB(docData);
            updateStatus(`Data disimpan offline. Akan dikirim saat online.`, true);
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
    try {
        const pending = await getPendingSubmissions();
        if (pending.length === 0) return;

        console.log(`Found ${pending.length} pending submissions`);
        updateStatus(`Sinkronisasi ${pending.length} data offline...`, false);

        for (const item of pending) {
            try {
                await submitDataToFirestore(item);
                await deleteSubmission(item.id);
                console.log(`Synced: ${item.id}`);
            } catch (error) {
                console.error(`Failed to sync ${item.id}:`, error);
                break; // Stop if one fails
            }
        }
        
        updateStatus("Data offline berhasil disinkronkan!", false);
        if (currentUserId) loadUserHistory(currentUserId);
        
    } catch (error) {
        console.error("Sync error:", error);
    }
}

// --- User History ---
function loadUserHistory(userId) {
    if (!db) return;
    
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

        const records = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            records.push({
                ...data,
                id: doc.id,
                timestamp: data.timestamp?.toDate() || new Date(data.createdAt || 0)
            });
        });
        
        // Sort locally
        records.sort((a, b) => b.timestamp - a.timestamp);

        historyContainer.innerHTML = records.slice(0, 5).map(record => {
            const time = record.timestamp.toLocaleTimeString('id-ID');
            const date = record.timestamp.toLocaleDateString('id-ID');
            const statusClass = record.type === 'IN' ? 'text-green-400' : 'text-yellow-400';
            const location = record.locationName.split(',')[0] || 'Unknown';

            return `
                <div class="flex justify-between items-center border-b border-gray-800 py-2">
                    <span class="${statusClass} font-bold text-sm">${record.type}</span>
                    <span class="text-xs">${date} ${time}</span>
                    <span class="text-gray-500 text-xs truncate max-w-[150px]">${location}</span>
                </div>
            `;
        }).join('');
    }, (error) => {
        console.error("Error loading history:", error);
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
    updateStatus(`Memulai proses untuk ${type}...`, true);

    try {
        await getLocation();
        await startCamera();
        
        startBtn.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        captureBtn.textContent = `Ambil Foto untuk ${type}`;

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
    offlineStatus.classList.add('hidden');
    updateStatus("Koneksi kembali. Sinkronisasi data...", false);
    syncData();
});

window.addEventListener('offline', () => {
    offlineStatus.classList.remove('hidden');
    updateStatus("Koneksi terputus. Mode offline aktif.", true);
});

// --- Initialize ---
initApp();
