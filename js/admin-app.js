// js/admin-app.js
console.log('📊 Loading admin-app.js...');

import {
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  doc,
  deleteDoc,
  getDoc,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

import { 
  auth, 
  db, 
  getCollectionPath,
  COLLECTIONS,
  isFirebaseInitialized,
  getFirebaseInfo
} from '/firebase-config.js';

if (!isFirebaseInitialized()) {
  console.error('❌ Firebase not initialized!');
  alert('System error: Firebase not initialized');
  throw new Error('Firebase not initialized');
}

console.log('✅ Firebase verified in admin-app.js');

const COLLECTION_NAME = getCollectionPath();
const MAX_RECORDS = 100;

const DOM = {
  tbody: document.getElementById('attendance-table-body'),
  verifPhoto: document.getElementById('verification-photo'),
  noPhotoMsg: document.getElementById('no-photo-msg'),
  detailView: document.getElementById('detail-view'),
  verifStatus: document.getElementById('verif-status'),
  verifTime: document.getElementById('verif-time'),
  verifUser: document.getElementById('verif-user'),
  verifCoords: document.getElementById('verif-coords'),
  verifMap: document.getElementById('verif-map-link'),
  totalRecords: document.getElementById('total-records'),
  totalMasuk: document.getElementById('total-masuk'),
  totalPulang: document.getElementById('total-pulang'),
  userInfo: document.getElementById('user-info'),
  logoutBtn: document.getElementById('logout-btn'),
  refreshBtn: document.getElementById('refresh-btn')
};

let allRecords = [];
let unsubscribeSnapshot = null;
let currentUserRole = null;

// ========================================
// ✅ CHECK IF USER IS ADMIN
// ========================================
async function checkAdminRole(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      console.warn('⚠️ User document not found');
      return false;
    }
    
    const userData = userDoc.data();
    return userData.role === 'admin';
    
  } catch (error) {
    console.error('❌ Error checking admin role:', error);
    return false;
  }
}

// ========================================
// ✅ SHOW UNAUTHORIZED PAGE
// ========================================
function showUnauthorized() {
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div class="text-center">
        <i class="fas fa-lock text-6xl text-red-500 mb-4"></i>
        <h1 class="text-3xl font-bold text-white mb-4">Access Denied</h1>
        <p class="text-gray-400 mb-8">You don't have permission to access this page.</p>
        <p class="text-gray-500 mb-8">Only admin users can access the dashboard.</p>
        <div class="space-x-4">
          <a href="/login.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
            Go to Login
          </a>
          <a href="/employee.html" class="inline-block bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600">
            Employee Page
          </a>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// AUTH
// ========================================
async function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('✅ User logged in:', user.email || user.uid);
      
      // ✅ CHECK IF ADMIN
      const isAdmin = await checkAdminRole(user.uid);
      
      if (!isAdmin) {
        console.warn('⚠️ User is not admin. Access denied.');
        showUnauthorized();
        return;
      }
      
      currentUserRole = 'admin';
      console.log('✅ Admin access granted');
      
      if (DOM.userInfo) {
        DOM.userInfo.textContent = user.email || `Admin: ${user.uid.slice(-6)}`;
      }
      
      loadData();
      
    } else {
      // Not logged in - redirect to login
      console.log('❌ User not logged in. Redirecting...');
      window.location.href = '/login.html';
    }
  });
}

// ... (rest of the code tetap sama)

function loadData() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, COLLECTION_NAME),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      orderBy('timestamp', 'desc'),
      limit(MAX_RECORDS)
    );
    
    unsubscribeSnapshot = onSnapshot(q, 
      (snapshot) => {
        allRecords = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date()
        }));
        
        console.log(`📊 Loaded ${allRecords.length} records`);
        updateStats();
        renderTable();
      },
      (error) => {
        console.error('❌ Snapshot error:', error);
        
        if (error.code === 'permission-denied') {
          showError('⚠️ Permission denied. Deploy Firestore rules dengan role admin!');
        } else {
          showError('Error loading data: ' + error.message);
        }
      }
    );
    
  } catch (error) {
    console.error('❌ Load data error:', error);
    showError('Failed to load data: ' + error.message);
  }
}

function updateStats() {
  const totalMasuk = allRecords.filter(r => r.type === 'masuk').length;
  const totalPulang = allRecords.filter(r => r.type === 'pulang').length;
  
  if (DOM.totalRecords) DOM.totalRecords.textContent = allRecords.length;
  if (DOM.totalMasuk) DOM.totalMasuk.textContent = totalMasuk;
  if (DOM.totalPulang) DOM.totalPulang.textContent = totalPulang;
}

function renderTable() {
  if (!DOM.tbody) return;
  
  if (allRecords.length === 0) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-gray-500">
          <i class="fas fa-inbox text-3xl mb-2"></i>
          <p>Belum ada data absensi hari ini</p>
        </td>
      </tr>
    `;
    return;
  }
  
  DOM.tbody.innerHTML = allRecords.map(r => {
    const typeColor = r.type === 'masuk' ? '#10b981' : '#f59e0b';
    const typeIcon = r.type === 'masuk' ? 'fa-sign-in-alt' : 'fa-sign-out-alt';
    
    return `
      <tr class="table-row border-b border-gray-800 cursor-pointer transition" onclick="showDetail('${r.id}')">
        <td class="p-3 text-sm">
          ${r.timestamp.toLocaleString('id-ID', { 
            day: '2-digit', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </td>
        <td class="p-3">
          <span class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold" 
                style="background: ${typeColor}20; color: ${typeColor};">
            <i class="fas ${typeIcon} mr-1"></i>
            ${r.type?.toUpperCase() || '-'}
          </span>
        </td>
        <td class="p-3 text-sm">
          <i class="fas fa-user mr-1 text-gray-500"></i>
          ${r.userEmail || r.userId?.slice(-8) || 'Guest'}
        </td>
        <td class="p-3 text-sm text-gray-400">
          <i class="fas fa-map-marker-alt mr-1"></i>
          ${truncate(r.locationName || 'Unknown', 20)}
        </td>
        <td class="p-3">
          <button 
            onclick="event.stopPropagation(); deleteRecord('${r.id}')" 
            class="text-red-400 hover:text-red-300 transition text-sm"
            title="Hapus"
          >
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.showDetail = function(id) {
  const record = allRecords.find(r => r.id === id);
  if (!record) return;
  
  if (DOM.noPhotoMsg) DOM.noPhotoMsg.classList.add('hidden');
  if (DOM.detailView) DOM.detailView.classList.remove('hidden');
  
  if (DOM.verifPhoto) {
    if (record.photoBase64) {
      DOM.verifPhoto.src = record.photoBase64;
      DOM.verifPhoto.onerror = () => {
        DOM.verifPhoto.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23ddd"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">No Photo</text></svg>';
      };
    } else {
      DOM.verifPhoto.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23ddd"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">No Photo</text></svg>';
    }
  }
  
  const typeColor = record.type === 'masuk' ? '#10b981' : '#f59e0b';
  if (DOM.verifStatus) {
    DOM.verifStatus.innerHTML = `<span style="color: ${typeColor}">${record.type?.toUpperCase() || '-'}</span>`;
  }
  if (DOM.verifTime) {
    DOM.verifTime.textContent = record.timestamp.toLocaleString('id-ID');
  }
  if (DOM.verifUser) {
    DOM.verifUser.textContent = record.userEmail || record.userId?.slice(-8) || 'Anonymous';
  }
  
  if (record.coordinates && record.coordinates.latitude) {
    const { latitude, longitude } = record.coordinates;
    if (DOM.verifCoords) {
      DOM.verifCoords.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
    if (DOM.verifMap) {
      DOM.verifMap.href = `https://maps.google.com/?q=${latitude},${longitude}`;
      DOM.verifMap.classList.remove('hidden');
    }
  } else {
    if (DOM.verifCoords) {
      DOM.verifCoords.textContent = 'Tidak ada data lokasi';
    }
    if (DOM.verifMap) {
      DOM.verifMap.classList.add('hidden');
    }
  }
};

window.deleteRecord = async function(id) {
  if (!confirm('Hapus record ini?\nTindakan ini tidak dapat dibatalkan.')) return;
  
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    console.log('✅ Deleted:', id);
    
    const record = allRecords.find(r => r.id === id);
    if (record) {
      if (DOM.detailView) DOM.detailView.classList.add('hidden');
      if (DOM.noPhotoMsg) DOM.noPhotoMsg.classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('❌ Delete error:', error);
    alert('Gagal menghapus record: ' + error.message);
  }
};

async function logout() {
  if (!confirm('Logout dari admin panel?')) return;
  
  try {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
    }
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('❌ Logout error:', error);
    alert('Logout failed: ' + error.message);
  }
}

function refreshData() {
  if (DOM.refreshBtn) {
    DOM.refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-1"></i> Refreshing...';
  }
  
  setTimeout(() => {
    if (DOM.refreshBtn) {
      DOM.refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Refresh';
    }
  }, 1000);
}

function truncate(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function showError(message) {
  if (DOM.tbody) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-red-400">
          <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
          <p>${message}</p>
        </td>
      </tr>
    `;
  }
}

DOM.logoutBtn?.addEventListener('click', logout);
DOM.refreshBtn?.addEventListener('click', refreshData);

window.addEventListener('beforeunload', () => {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
  }
});

console.log('🚀 Starting Admin App...');
initAuth();
