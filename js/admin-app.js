// js/admin-app.js
import { app, auth, db, getCollectionPath } from '../firebase-config.js';
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

// ========================================
// DOM ELEMENTS
// ========================================
const DOM = {
  tableBody: document.getElementById('attendance-table-body'),
  verifPhoto: document.getElementById('verification-photo'),
  noPhotoMsg: document.getElementById('no-photo-msg'),
  verifStatus: document.getElementById('verif-status'),
  verifTime: document.getElementById('verif-time'),
  verifCoords: document.getElementById('verif-coords'),
  verifMapLink: document.getElementById('verif-map-link')
};

// ========================================
// STATE
// ========================================
let allRecords = [];
let currentUser = null;

// ========================================
// AUTHENTICATION
// ========================================
async function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log('✅ Admin logged in:', user.uid);
      loadAttendanceData();
    } else {
      // Auto login for demo
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Auth error:', error);
      }
    }
  });
}

// ========================================
// LOAD DATA
// ========================================
function loadAttendanceData() {
  const q = query(
    collection(db, getCollectionPath()),
    orderBy('timestamp', 'desc'),
    limit(100)
  );
  
  onSnapshot(q, (snapshot) => {
    allRecords = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    }));
    
    renderTable();
    updateStatistics();
    
    // Show first record detail by default
    if (allRecords.length > 0) {
      showDetail(allRecords[0].id);
    }
  });
}

// ========================================
// RENDER TABLE
// ========================================
function renderTable() {
  if (allRecords.length === 0) {
    DOM.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-gray-400">
          Tidak ada data absensi
        </td>
      </tr>
    `;
    return;
  }
  
  DOM.tableBody.innerHTML = allRecords.map(record => {
    const typeColor = record.type === 'masuk' ? 'text-green-400' : 'text-yellow-400';
    const time = record.timestamp.toLocaleString('id-ID');
    
    return `
      <tr class="hover:bg-gray-800 cursor-pointer border-b border-gray-700">
        <td class="py-2 px-3 text-sm">${time}</td>
        <td class="py-2 px-3">
          <span class="${typeColor} font-bold">${record.type?.toUpperCase() || '-'}</span>
        </td>
        <td class="py-2 px-3 text-gray-300">
          ${record.userId?.slice(-6) || 'Guest'}
        </td>
        <td class="py-2 px-3 text-gray-400 text-sm">
          ${record.locationName || 'Unknown'}
        </td>
        <td class="py-2 px-3 text-center">
          <button onclick="showDetail('${record.id}')" 
                  class="text-blue-400 hover:text-blue-300 mr-2">
            <i class="fas fa-eye"></i>
          </button>
          <button onclick="deleteRecord('${record.id}')" 
                  class="text-red-400 hover:text-red-300">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ========================================
// UPDATE STATISTICS
// ========================================
function updateStatistics() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayRecords = allRecords.filter(record => {
    const recordDate = new Date(record.timestamp);
    recordDate.setHours(0, 0, 0, 0);
    return recordDate.getTime() === today.getTime();
  });
  
  const stats = {
    total: todayRecords.length,
    masuk: todayRecords.filter(r => r.type === 'masuk').length,
    pulang: todayRecords.filter(r => r.type === 'pulang').length
  };
  
  // Update stat cards if elements exist
  const statElement = document.getElementById('stat-today');
  if (statElement) {
    statElement.innerHTML = `
      <div class="text-center">
        <p class="text-3xl font-bold text-blue-400">${stats.total}</p>
        <p class="text-sm text-gray-400">Total Hari Ini</p>
        <div class="mt-2 text-xs">
          <span class="text-green-400">Masuk: ${stats.masuk}</span> | 
          <span class="text-yellow-400">Pulang: ${stats.pulang}</span>
        </div>
      </div>
    `;
  }
}

// ========================================
// SHOW DETAIL
// ========================================
function showDetail(recordId) {
  const record = allRecords.find(r => r.id === recordId);
  if (!record) return;
  
  // Hide no photo message
  DOM.noPhotoMsg.classList.add('hidden');
  DOM.verifPhoto.classList.remove('hidden');
  
  // Display photo from base64
  if (record.photoBase64) {
    DOM.verifPhoto.src = record.photoBase64;
  } else {
    DOM.verifPhoto.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjEwMCIgeT0iNzUiIGZpbGw9IiM5OTkiIGZvbnQtc2l6ZT0iMTgiPk5vIFBob3RvPC90ZXh0Pjwvc3ZnPg==';
  }
  
  // Update details
  DOM.verifStatus.textContent = `${record.type?.toUpperCase() || 'UNKNOWN'} - ${record.userId?.slice(-6) || 'Guest'}`;
  DOM.verifTime.textContent = record.timestamp.toLocaleString('id-ID');
  
  // Coordinates
  if (record.coordinates) {
    DOM.verifCoords.textContent = `${record.coordinates.latitude?.toFixed(4) || 0}, ${record.coordinates.longitude?.toFixed(4) || 0}`;
    DOM.verifMapLink.href = `https://maps.google.com/?q=${record.coordinates.latitude},${record.coordinates.longitude}`;
    DOM.verifMapLink.classList.remove('hidden');
  } else {
    DOM.verifCoords.textContent = 'Tidak ada data lokasi';
    DOM.verifMapLink.classList.add('hidden');
  }
}

// ========================================
// DELETE RECORD
// ========================================
async function deleteRecord(recordId) {
  if (!confirm('Hapus record ini?')) return;
  
  try {
    await deleteDoc(doc(db, getCollectionPath(), recordId));
    console.log('Record deleted:', recordId);
  } catch (error) {
    console.error('Delete error:', error);
    alert('Gagal menghapus record');
  }
}

// ========================================
// EXPORT DATA
// ========================================
function exportToCSV() {
  if (allRecords.length === 0) {
    alert('Tidak ada data untuk diexport');
    return;
  }
  
  const headers = ['Waktu', 'Tipe', 'User ID', 'Lokasi', 'Koordinat'];
  const rows = allRecords.map(r => [
    r.timestamp.toLocaleString('id-ID'),
    r.type || '-',
    r.userId || '-',
    r.locationName || '-',
    r.coordinates ? `${r.coordinates.latitude},${r.coordinates.longitude}` : '-'
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `attendance_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ========================================
// REFRESH DATA
// ========================================
function refreshData() {
  loadAttendanceData();
  console.log('Data refreshed');
}

// ========================================
// GLOBAL FUNCTIONS
// ========================================
window.showDetail = showDetail;
window.deleteRecord = deleteRecord;
window.exportToExcel = exportToCSV;
window.refreshData = refreshData;

// ========================================
// INITIALIZE
// ========================================
handleAuth();
