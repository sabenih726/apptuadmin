// js/admin-app.js
console.log('📊 Loading admin-app.js...');

import {
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
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// Import dari firebase-config.js
import { 
  auth, 
  db, 
  getCollectionPath,
  COLLECTIONS,
  ROLES,
  isFirebaseInitialized,
  getUserRole
} from '/firebase-config.js';

// ========================================
// VERIFY FIREBASE
// ========================================
if (!isFirebaseInitialized()) {
  console.error('❌ Firebase not initialized!');
  alert('System error: Firebase not initialized');
  throw new Error('Firebase not initialized');
}

console.log('✅ Firebase verified in admin-app.js');

// ========================================
// CONFIG
// ========================================
const COLLECTION_NAME = getCollectionPath();
const MAX_RECORDS = 500; // Increased for export

// ========================================
// DOM ELEMENTS
// ========================================
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
  refreshBtn: document.getElementById('refresh-btn'),
  // Export & Filter elements
  dateFrom: document.getElementById('date-from'),
  dateTo: document.getElementById('date-to'),
  filterBtn: document.getElementById('filter-btn'),
  exportBtn: document.getElementById('export-excel-btn'),
  resetBtn: document.getElementById('reset-filter-btn'),
  filterInfo: document.getElementById('filter-info'),
  filterInfoText: document.getElementById('filter-info-text')
};

// ========================================
// STATE
// ========================================
let allRecords = [];
let unsubscribeSnapshot = null;
let currentUserRole = null;
let filteredRecords = [];
let isFiltered = false;

// ========================================
// SHOW UNAUTHORIZED PAGE
// ========================================
function showUnauthorized() {
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div class="text-center max-w-md">
        <div class="mb-8">
          <i class="fas fa-shield-alt text-8xl text-red-500 mb-4"></i>
        </div>
        <h1 class="text-4xl font-bold text-white mb-4">Access Denied</h1>
        <p class="text-gray-400 text-lg mb-4">You don't have permission to access this page.</p>
        <div class="bg-red-900 bg-opacity-20 border border-red-500 rounded-lg p-4 mb-8">
          <p class="text-red-300 text-sm">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            Only admin users can access the dashboard.
          </p>
        </div>
        <div class="space-y-3">
          <a href="/login.html" class="block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition">
            <i class="fas fa-sign-in-alt mr-2"></i>
            Go to Login
          </a>
          <a href="/employee.html" class="block bg-gray-700 text-white px-8 py-3 rounded-lg hover:bg-gray-600 transition">
            <i class="fas fa-user mr-2"></i>
            Employee Page
          </a>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// SHOW LOADING PAGE
// ========================================
function showLoading() {
  if (DOM.tbody) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12">
          <i class="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
          <p class="text-gray-400">Verifying admin access...</p>
        </td>
      </tr>
    `;
  }
}

// ========================================
// AUTH WITH ROLE CHECK
// ========================================
async function initAuth() {
  showLoading();
  
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log('❌ User not logged in. Redirecting...');
      window.location.href = '/login.html';
      return;
    }
    
    console.log('✅ User logged in:', user.email || user.uid);
    
    try {
      // Check if user is admin (will auto-create if missing)
      const userRole = await getUserRole(user.uid, true);
      
      console.log('👤 User role:', userRole);
      
      if (userRole !== ROLES.ADMIN) {
        console.warn('⚠️ User is not admin. Access denied.');
        showUnauthorized();
        return;
      }
      
      currentUserRole = userRole;
      console.log('✅ Admin access granted');
      
      // Update UI
      if (DOM.userInfo) {
        const userName = user.email || user.displayName || `Admin-${user.uid.slice(-6)}`;
        DOM.userInfo.innerHTML = `
          <i class="fas fa-user-shield mr-2"></i>
          ${userName}
        `;
      }
      
      // Enable logout button
      if (DOM.logoutBtn) {
        DOM.logoutBtn.disabled = false;
      }
      
      // Load data
      loadData();
      
    } catch (error) {
      console.error('❌ Role check error:', error);
      
      if (DOM.tbody) {
        DOM.tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-12">
              <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
              <p class="text-red-400 mb-2">Error verifying admin access</p>
              <p class="text-gray-500 text-sm">${error.message}</p>
              <div class="mt-4 space-x-2">
                <button onclick="location.reload()" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                  Retry
                </button>
                <a href="/fix-user.html" class="inline-block bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700">
                  Fix Account
                </a>
              </div>
            </td>
          </tr>
        `;
      }
    }
  });
}

// ========================================
// LOAD DATA
// ========================================
function loadData() {
  try {
    // Load data dari 30 hari terakhir
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, COLLECTION_NAME),
      where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)),
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
        
        // Reset filter state when new data arrives
        if (!isFiltered) {
          // Show today's data by default
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayRecords = allRecords.filter(r => r.timestamp >= today);
          
          updateStats(todayRecords);
          renderTable(todayRecords);
        } else {
          // Re-apply filter if active
          filterData();
        }
      },
      (error) => {
        console.error('❌ Snapshot error:', error);
        
        if (error.code === 'permission-denied') {
          showError('⚠️ Permission denied. Cek Firestore rules!\n\nRun: firebase deploy --only firestore:rules');
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

// ========================================
// UPDATE STATS
// ========================================
function updateStats(data = null) {
  const records = data || allRecords;
  const totalMasuk = records.filter(r => r.type === 'masuk').length;
  const totalPulang = records.filter(r => r.type === 'pulang').length;
  
  if (DOM.totalRecords) DOM.totalRecords.textContent = records.length;
  if (DOM.totalMasuk) DOM.totalMasuk.textContent = totalMasuk;
  if (DOM.totalPulang) DOM.totalPulang.textContent = totalPulang;
}

// ========================================
// RENDER TABLE
// ========================================
function renderTable(data = null) {
  if (!DOM.tbody) return;
  
  const records = data || allRecords;
  
  if (records.length === 0) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12 text-gray-500">
          <i class="fas fa-inbox text-5xl mb-4 opacity-30"></i>
          <p class="text-lg">Belum ada data absensi</p>
          <p class="text-sm mt-2">Data akan muncul setelah karyawan melakukan absensi</p>
        </td>
      </tr>
    `;
    return;
  }
  
  DOM.tbody.innerHTML = records.map(r => {
    const typeColor = r.type === 'masuk' ? '#10b981' : '#f59e0b';
    const typeIcon = r.type === 'masuk' ? 'fa-sign-in-alt' : 'fa-sign-out-alt';
    
    return `
      <tr class="table-row border-b border-gray-800 cursor-pointer transition hover:bg-gray-800" onclick="showDetail('${r.id}')">
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
        <td class="p-3 text-sm text-gray-400" title="${r.locationName || 'Unknown'}">
          <i class="fas fa-map-marker-alt mr-1"></i>
          ${truncate(r.locationName || 'Unknown', 30)}
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

// ========================================
// EXPORT TO EXCEL
// ========================================
function exportToExcel() {
  try {
    // Check if XLSX is loaded
    if (typeof XLSX === 'undefined') {
      alert('Library Excel belum dimuat. Silakan refresh halaman.');
      return;
    }
    
    // Use filtered records if filter is active, otherwise use today's data
    let dataToExport;
    if (isFiltered) {
      dataToExport = filteredRecords;
    } else {
      // Export today's data by default
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dataToExport = allRecords.filter(r => r.timestamp >= today);
    }
    
    if (dataToExport.length === 0) {
      alert('Tidak ada data untuk di-export');
      return;
    }
    
    // Prepare data for Excel
    const excelData = dataToExport.map(record => ({
      'Tanggal': record.timestamp.toLocaleDateString('id-ID'),
      'Waktu': record.timestamp.toLocaleTimeString('id-ID'),
      'Status': record.type?.toUpperCase() || '-',
      'User ID': record.userId || '-',
      'Email': record.userEmail || '-',
      'Lokasi': record.locationName || 'Unknown',
      'Latitude': record.coordinates?.latitude || '-',
      'Longitude': record.coordinates?.longitude || '-'
    }));
    
    // Create workbook
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absensi');
    
    // Auto-size columns
    const colWidths = [
      { wch: 12 }, // Tanggal
      { wch: 10 }, // Waktu
      { wch: 8 },  // Status
      { wch: 15 }, // User ID
      { wch: 25 }, // Email
      { wch: 40 }, // Lokasi
      { wch: 12 }, // Latitude
      { wch: 12 }  // Longitude
    ];
    ws['!cols'] = colWidths;
    
    // Generate filename with date
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const filename = `Absensi_${dateStr}.xlsx`;
    
    // Download file
    XLSX.writeFile(wb, filename);
    
    console.log(`✅ Exported ${dataToExport.length} records to ${filename}`);
    
  } catch (error) {
    console.error('❌ Export error:', error);
    alert('Gagal export ke Excel: ' + error.message);
  }
}

// ========================================
// FILTER DATA BY DATE
// ========================================
function filterData() {
  const dateFrom = DOM.dateFrom?.value;
  const dateTo = DOM.dateTo?.value;
  
  if (!dateFrom && !dateTo) {
    alert('Silakan pilih tanggal untuk filter');
    return;
  }
  
  let filtered = [...allRecords];
  
  // Filter by start date
  if (dateFrom) {
    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    filtered = filtered.filter(r => r.timestamp >= startDate);
  }
  
  // Filter by end date
  if (dateTo) {
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(r => r.timestamp <= endDate);
  }
  
  filteredRecords = filtered;
  isFiltered = true;
  
  // Update UI
  renderTable(filteredRecords);
  updateStats(filteredRecords);
  updateFilterInfo(dateFrom, dateTo);
  
  console.log(`📊 Filtered: ${filtered.length} of ${allRecords.length} records`);
}

// ========================================
// RESET FILTER
// ========================================
function resetFilter() {
  // Clear date inputs
  if (DOM.dateFrom) DOM.dateFrom.value = '';
  if (DOM.dateTo) DOM.dateTo.value = '';
  
  // Reset filter state
  filteredRecords = [];
  isFiltered = false;
  
  // Hide filter info
  if (DOM.filterInfo) DOM.filterInfo.classList.add('hidden');
  
  // Show today's data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRecords = allRecords.filter(r => r.timestamp >= today);
  
  renderTable(todayRecords);
  updateStats(todayRecords);
  
  console.log('🔄 Filter reset');
}

// ========================================
// UPDATE FILTER INFO
// ========================================
function updateFilterInfo(dateFrom, dateTo) {
  if (!DOM.filterInfo || !DOM.filterInfoText) return;
  
  DOM.filterInfo.classList.remove('hidden');
  
  let infoText = 'Filter aktif: ';
  if (dateFrom && dateTo) {
    infoText += `${formatDate(dateFrom)} s/d ${formatDate(dateTo)}`;
  } else if (dateFrom) {
    infoText += `Mulai ${formatDate(dateFrom)}`;
  } else if (dateTo) {
    infoText += `Sampai ${formatDate(dateTo)}`;
  }
  
  infoText += ` (${filteredRecords.length} data)`;
  DOM.filterInfoText.textContent = infoText;
}

// ========================================
// FORMAT DATE UTILITY
// ========================================
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// ========================================
// SHOW DETAIL
// ========================================
window.showDetail = function(id) {
  // Find record from all records (not just filtered)
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
  
  if (DOM.verifCoords) {
    const locationName = record.locationName || 'Unknown';
    const hasCoordinates = record.coordinates && record.coordinates.latitude;
    
    DOM.verifCoords.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-start">
          <i class="fas fa-map-marker-alt mr-2 mt-1 text-blue-400"></i>
          <div class="flex-1">
            <p class="text-white font-semibold text-sm">Alamat:</p>
            <p class="text-gray-300 text-xs mt-1">${locationName}</p>
          </div>
        </div>
        
        ${hasCoordinates ? `
        <div class="flex items-center text-xs text-gray-500">
          <i class="fas fa-crosshairs mr-2"></i>
          <span>${record.coordinates.latitude.toFixed(6)}, ${record.coordinates.longitude.toFixed(6)}</span>
        </div>
        ` : ''}
      </div>
    `;
  }
  
  if (record.coordinates && record.coordinates.latitude) {
    const { latitude, longitude } = record.coordinates;
    if (DOM.verifMap) {
      DOM.verifMap.href = `https://maps.google.com/?q=${latitude},${longitude}`;
      DOM.verifMap.classList.remove('hidden');
    }
  } else {
    if (DOM.verifMap) {
      DOM.verifMap.classList.add('hidden');
    }
  }
};

// ========================================
// DELETE RECORD
// ========================================
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

// ========================================
// LOGOUT
// ========================================
async function handleLogout() {
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

// ========================================
// REFRESH DATA
// ========================================
function refreshData() {
  if (DOM.refreshBtn) {
    const originalHTML = DOM.refreshBtn.innerHTML;
    DOM.refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-1"></i> Refreshing...';
    DOM.refreshBtn.disabled = true;
    
    // Reset filter and reload
    resetFilter();
    
    setTimeout(() => {
      DOM.refreshBtn.innerHTML = originalHTML;
      DOM.refreshBtn.disabled = false;
    }, 1000);
  }
}

// ========================================
// UTILITY
// ========================================
function truncate(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function showError(message) {
  if (DOM.tbody) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12">
          <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>
          <div class="text-red-400">${message}</div>
          <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            <i class="fas fa-redo mr-2"></i>
            Reload Page
          </button>
        </td>
      </tr>
    `;
  }
}

// Make functions available globally for onclick handlers
window.resetFilter = resetFilter;

// ========================================
// EVENT LISTENERS
// ========================================
DOM.logoutBtn?.addEventListener('click', handleLogout);
DOM.refreshBtn?.addEventListener('click', refreshData);
DOM.exportBtn?.addEventListener('click', exportToExcel);
DOM.filterBtn?.addEventListener('click', filterData);
DOM.resetBtn?.addEventListener('click', resetFilter);

// Set default dates to today
if (DOM.dateFrom && DOM.dateTo) {
  const today = new Date().toISOString().split('T')[0];
  DOM.dateFrom.value = today;
  DOM.dateTo.value = today;
}

window.addEventListener('beforeunload', () => {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
  }
});

// ========================================
// INITIALIZE
// ========================================
console.log('🚀 Starting Admin App...');
initAuth();
