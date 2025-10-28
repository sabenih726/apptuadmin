// js/admin-app.js
import { app, auth, db, getCollectionPath } from '../firebase-config.js';
import {
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  collection,
  query,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// --- DOM Elements ---
const tbody = document.getElementById('attendance-table-body');
const verifPhoto = document.getElementById('verification-photo');
const noPhotoMsg = document.getElementById('no-photo-msg');
const verifStatus = document.getElementById('verif-status');
const verifTime = document.getElementById('verif-time');
const verifCoords = document.getElementById('verif-coords');
const verifMap = document.getElementById('verif-map-link');

let allRecords = [];

// --- Inisialisasi Autentikasi ---
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log(`✅ Terhubung sebagai ${user.uid}`);
      loadData();
    } else {
      console.log("🔑 Login anonim dimulai...");
      await signInAnonymously(auth);
    }
  });

  // Jika tersedia token khusus (mis. dari admin login)
  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      await signInWithCustomToken(auth, __initial_auth_token);
    }
  } catch (err) {
    console.error("❌ Gagal autentikasi admin:", err);
  }
}

// --- Ambil data absensi realtime ---
function loadData() {
  const q = query(collection(db, getCollectionPath()));
  onSnapshot(q, (snap) => {
    if (snap.empty) {
      tbody.innerHTML = `
        <tr><td colspan="5" align="center" class="text-gray-400 py-4">
          Tidak ada data absensi.
        </td></tr>`;
      return;
    }

    allRecords = snap.docs.map(d => ({
      ...d.data(),
      id: d.id,
      timestamp: d.data().timestamp?.toDate?.() || new Date(0)
    })).sort((a, b) => b.timestamp - a.timestamp);

    renderTable();
    renderDetail(allRecords[0]);
  }, (err) => {
    console.error("❌ Error membaca Firestore:", err);
  });
}

// --- Tampilkan tabel data ---
function renderTable() {
  tbody.innerHTML = allRecords.map(r => `
    <tr class="hover:bg-gray-800 border-b border-gray-700">
      <td class="py-2 px-3">${r.timestamp.toLocaleString('id-ID')}</td>
      <td class="py-2 px-3 ${r.type === 'IN' ? 'text-green-400' : 'text-yellow-400'} font-bold">${r.type}</td>
      <td class="py-2 px-3 text-gray-300">...${r.userId?.slice(-6) || '-'}</td>
      <td class="py-2 px-3 text-gray-400">${r.locationName || '-'}</td>
      <td class="py-2 px-3">
        <button onclick="viewDetail('${r.id}')" class="text-blue-400 hover:text-blue-300 underline">
          Detail
        </button>
      </td>
    </tr>
  `).join('');
}

// --- Tampilkan detail absensi ---
function renderDetail(r) {
  if (!r) {
    noPhotoMsg.classList.remove('hidden');
    verifPhoto.classList.add('hidden');
    verifStatus.textContent = '';
    verifTime.textContent = '';
    verifCoords.textContent = '';
    return;
  }

  noPhotoMsg.classList.add('hidden');
  verifPhoto.classList.remove('hidden');

  verifPhoto.src = r.photoBase64 || 'https://placehold.co/200x150?text=No+Photo';
  verifStatus.textContent = `${r.type} oleh ...${r.userId?.slice(-6) || 'User'}`;
  verifTime.textContent = r.timestamp.toLocaleString('id-ID');
  verifCoords.textContent = `${r.coordinates?.latitude || 0}, ${r.coordinates?.longitude || 0}`;
  verifMap.href = `https://www.google.com/maps?q=${r.coordinates?.latitude || 0},${r.coordinates?.longitude || 0}`;
}

// --- Fungsi global untuk tombol Detail ---
window.viewDetail = (id) => {
  const rec = allRecords.find(r => r.id === id);
  renderDetail(rec);
};

// --- Jalankan Auth saat halaman dibuka ---
handleAuth();
