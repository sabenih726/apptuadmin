// js/admin-app.js
console.log('📊 Loading admin-app.js...');

// Use global variables
const auth = window.firebaseAuth;
const db = window.firebaseDB;
const getCollectionPath = window.getCollectionPath;

if (!auth || !db) {
  console.error('❌ Firebase not initialized in admin!');
  alert('System error');
  throw new Error('Firebase not initialized');
}

console.log('✅ Firebase verified in admin-app.js');

import {
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// DOM
const tbody = document.getElementById('attendance-table-body');
const verifPhoto = document.getElementById('verification-photo');
const noPhotoMsg = document.getElementById('no-photo-msg');
const detailContainer = document.getElementById('detail-container');
const verifStatus = document.getElementById('verif-status');
const verifTime = document.getElementById('verif-time');
const verifCoords = document.getElementById('verif-coords');
const verifMap = document.getElementById('verif-map-link');

let allRecords = [];

// AUTH
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('✅ Admin logged in:', user.uid);
      loadData();
    } else {
      await signInAnonymously(auth);
    }
  });
}

// LOAD DATA
function loadData() {
  const q = query(
    collection(db, getCollectionPath()),
    orderBy('timestamp', 'desc'),
    limit(50)
  );
  
  onSnapshot(q, (snapshot) => {
    allRecords = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    }));
    
    renderTable();
  });
}

// RENDER TABLE
function renderTable() {
  if (allRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" align="center" class="py-4">Tidak ada data</td></tr>';
    return;
  }
  
  tbody.innerHTML = allRecords.map(r => `
    <tr onclick="showDetail('${r.id}')" style="cursor: pointer;">
      <td style="padding: 0.5rem;">${r.timestamp.toLocaleString('id-ID')}</td>
      <td style="padding: 0.5rem; color: ${r.type === 'masuk' ? '#10b981' : '#f59e0b'};">
        ${r.type?.toUpperCase() || '-'}
      </td>
      <td style="padding: 0.5rem;">${r.userId?.slice(-6) || 'Guest'}</td>
      <td style="padding: 0.5rem;">${r.locationName || 'Unknown'}</td>
      <td style="padding: 0.5rem;">
        <button onclick="event.stopPropagation(); deleteRecord('${r.id}')" style="color: #ef4444;">
          Hapus
        </button>
      </td>
    </tr>
  `).join('');
}

// SHOW DETAIL
window.showDetail = function(id) {
  const record = allRecords.find(r => r.id === id);
  if (!record) return;
  
  noPhotoMsg.style.display = 'none';
  detailContainer.style.display = 'block';
  verifPhoto.classList.remove('hidden');
  
  verifPhoto.src = record.photoBase64 || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text x="50" y="50">No Photo</text></svg>';
  verifStatus.textContent = `${record.type?.toUpperCase() || '-'} - ${record.userId?.slice(-6) || 'Guest'}`;
  verifTime.textContent = record.timestamp.toLocaleString('id-ID');
  
  if (record.coordinates) {
    verifCoords.textContent = `${record.coordinates.latitude?.toFixed(4)}, ${record.coordinates.longitude?.toFixed(4)}`;
    verifMap.href = `https://maps.google.com/?q=${record.coordinates.latitude},${record.coordinates.longitude}`;
  } else {
    verifCoords.textContent = 'Tidak ada data lokasi';
  }
};

// DELETE
window.deleteRecord = async function(id) {
  if (!confirm('Hapus record ini?')) return;
  
  try {
    await deleteDoc(doc(db, getCollectionPath(), id));
    console.log('Deleted:', id);
  } catch (error) {
    console.error('Delete error:', error);
    alert('Gagal hapus');
  }
};

// INIT
handleAuth();
