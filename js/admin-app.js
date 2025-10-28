// js/admin-app.js
import { app, auth, db, storage, getCollectionPath } from '../firebase-config.js';
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  ITEMS_PER_PAGE: 10,
  REFRESH_INTERVAL: 30000, // 30 seconds
  CHART_COLORS: {
    present: '#10b981',
    permit: '#f59e0b',
    absent: '#ef4444'
  },
  EXPORT_FORMATS: ['CSV', 'EXCEL', 'PDF'],
  FILTERS: {
    dateRange: 'today',
    status: '',
    searchTerm: '',
    department: ''
  }
};

// ========================================
// STATE MANAGEMENT
// ========================================
class AdminState {
  constructor() {
    this.currentUser = null;
    this.allRecords = [];
    this.filteredRecords = [];
    this.currentPage = 1;
    this.selectedRecord = null;
    this.statistics = {
      today: { present: 0, permit: 0, absent: 0, total: 0 },
      week: { present: 0, permit: 0, absent: 0, total: 0 },
      month: { present: 0, permit: 0, absent: 0, total: 0 }
    };
    this.chartInstance = null;
    this.isLoading = false;
    this.filters = { ...CONFIG.FILTERS };
  }

  reset() {
    this.allRecords = [];
    this.filteredRecords = [];
    this.currentPage = 1;
    this.selectedRecord = null;
  }
}

const state = new AdminState();

// ========================================
// DOM ELEMENTS
// ========================================
const DOM = {
  // Navigation
  adminEmail: document.getElementById('admin-email'),
  liveIndicator: document.getElementById('live-indicator'),
  
  // Statistics
  statPresent: document.getElementById('stat-present'),
  statPermit: document.getElementById('stat-permit'),
  statAbsent: document.getElementById('stat-absent'),
  statTotal: document.getElementById('stat-total'),
  
  // Filters
  filterDate: document.getElementById('filter-date'),
  filterStatus: document.getElementById('filter-status'),
  searchBox: document.getElementById('search-box'),
  
  // Table
  tableBody: document.getElementById('attendance-table-body'),
  showingStart: document.getElementById('showing-start'),
  showingEnd: document.getElementById('showing-end'),
  totalRecords: document.getElementById('total-records'),
  pageInfo: document.getElementById('page-info'),
  
  // Detail Panel
  detailContent: document.getElementById('detail-content'),
  noSelection: document.getElementById('no-selection'),
  detailInfo: document.getElementById('detail-info'),
  detailPhoto: document.getElementById('detail-photo'),
  detailName: document.getElementById('detail-name'),
  detailTime: document.getElementById('detail-time'),
  detailStatus: document.getElementById('detail-status'),
  detailCoords: document.getElementById('detail-coords'),
  mapLink: document.getElementById('map-link'),
  
  // Chart
  attendanceChart: document.getElementById('attendanceChart'),
  
  // Loading
  loadingOverlay: document.getElementById('loading-overlay')
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
const Utils = {
  formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  },
  
  formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  showLoading(show = true) {
    state.isLoading = show;
    DOM.loadingOverlay.classList.toggle('hidden', !show);
  },
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  downloadFile(content, filename, type = 'text/csv') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  
  showNotification(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform translate-x-full`;
    
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    };
    
    toast.classList.add(colors[type] || colors.info);
    toast.innerHTML = `
      <div class="flex items-center text-white">
        <i class="fas fa-${type === 'success' ? 'check' : 'info'}-circle mr-2"></i>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.classList.remove('translate-x-full');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.add('translate-x-full');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
};

// ========================================
// AUTHENTICATION MODULE
// ========================================
const AuthModule = {
  async initialize() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await this.handleAdminLogin(user);
      } else {
        // Redirect to login
        window.location.href = 'login.html';
      }
    });
  },
  
  async handleAdminLogin(user) {
    state.currentUser = user;
    
    // Check if user is admin
    if (!user.email?.includes('admin')) {
      Utils.showNotification('Akses ditolak. Hanya admin yang diizinkan.', 'error');
      await this.logout();
      return;
    }
    
    // Update UI
    DOM.adminEmail.textContent = user.email;
    
    // Initialize dashboard
    await DashboardModule.initialize();
    
    Utils.showNotification(`Selamat datang, ${user.email}`, 'success');
  },
  
  async logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
      await signOut(auth);
      window.location.href = 'login.html';
    }
  }
};

// ========================================
// DATA MODULE
// ========================================
const DataModule = {
  unsubscribe: null,
  
  async loadAttendanceData() {
    Utils.showLoading(true);
    
    try {
      // Create query
      const q = query(
        collection(db, getCollectionPath()),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
      
      // Set up real-time listener
      if (this.unsubscribe) {
        this.unsubscribe();
      }
      
      this.unsubscribe = onSnapshot(q, 
        (snapshot) => {
          state.allRecords = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate() || new Date()
          }));
          
          // Apply filters
          this.applyFilters();
          
          // Update displays
          TableModule.render();
          StatisticsModule.calculate();
          ChartModule.update();
          
          Utils.showLoading(false);
          
          // Update live indicator
          this.updateLiveIndicator();
        },
        (error) => {
          console.error('Error loading data:', error);
          Utils.showNotification('Gagal memuat data', 'error');
          Utils.showLoading(false);
        }
      );
      
    } catch (error) {
      console.error('Error setting up listener:', error);
      Utils.showNotification('Gagal menghubungkan ke database', 'error');
      Utils.showLoading(false);
    }
  },
  
  applyFilters() {
    let filtered = [...state.allRecords];
    
    // Date filter
    if (state.filters.dateRange && state.filters.dateRange !== 'all') {
      const now = new Date();
      let startDate = new Date();
      
      switch(state.filters.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'custom':
          if (DOM.filterDate.value) {
            startDate = new Date(DOM.filterDate.value);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            
            filtered = filtered.filter(record => 
              record.timestamp >= startDate && record.timestamp <= endDate
            );
          }
          break;
      }
      
      if (state.filters.dateRange !== 'custom') {
        filtered = filtered.filter(record => record.timestamp >= startDate);
      }
    }
    
    // Status filter
    if (state.filters.status) {
      filtered = filtered.filter(record => 
        record.status === state.filters.status || 
        record.type?.toLowerCase() === state.filters.status
      );
    }
    
    // Search filter
    if (state.filters.searchTerm) {
      const term = state.filters.searchTerm.toLowerCase();
      filtered = filtered.filter(record => 
        record.userName?.toLowerCase().includes(term) ||
        record.userEmail?.toLowerCase().includes(term) ||
        record.userId?.toLowerCase().includes(term) ||
        record.location?.city?.toLowerCase().includes(term)
      );
    }
    
    state.filteredRecords = filtered;
    state.currentPage = 1; // Reset to first page
  },
  
  async deleteRecord(recordId) {
    if (!confirm('Apakah Anda yakin ingin menghapus record ini?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, getCollectionPath(), recordId));
      Utils.showNotification('Record berhasil dihapus', 'success');
    } catch (error) {
      console.error('Error deleting record:', error);
      Utils.showNotification('Gagal menghapus record', 'error');
    }
  },
  
  async verifyAttendance(recordId) {
    try {
      await updateDoc(doc(db, getCollectionPath(), recordId), {
        verified: true,
        verifiedBy: state.currentUser.email,
        verifiedAt: serverTimestamp()
      });
      Utils.showNotification('Absensi berhasil diverifikasi', 'success');
    } catch (error) {
      console.error('Error verifying record:', error);
      Utils.showNotification('Gagal memverifikasi absensi', 'error');
    }
  },
  
  updateLiveIndicator() {
    const indicator = DOM.liveIndicator;
    indicator.style.opacity = '1';
    setTimeout(() => {
      indicator.style.opacity = '0.5';
    }, 500);
  }
};

// ========================================
// TABLE MODULE
// ========================================
const TableModule = {
  render() {
    const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const end = start + CONFIG.ITEMS_PER_PAGE;
    const pageData = state.filteredRecords.slice(start, end);
    
    if (pageData.length === 0) {
      DOM.tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-gray-400">
            <i class="fas fa-inbox text-4xl mb-2"></i>
            <p>Tidak ada data</p>
          </td>
        </tr>
      `;
      this.updatePaginationInfo(0, 0, 0);
      return;
    }
    
    DOM.tableBody.innerHTML = pageData.map(record => {
      const statusBadge = this.getStatusBadge(record);
      const typeIcon = record.type === 'masuk' 
        ? '<i class="fas fa-sign-in-alt text-green-400"></i>'
        : '<i class="fas fa-sign-out-alt text-yellow-400"></i>';
      
      return `
        <tr class="hover:bg-slate-800 cursor-pointer transition-colors" 
            onclick="DetailModule.show('${record.id}')">
          <td class="px-4 py-3 text-sm">
            ${Utils.formatDateTime(record.timestamp)}
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              ${record.photoURL 
                ? `<img src="${record.photoURL}" class="w-8 h-8 rounded-full object-cover" alt="">`
                : '<div class="w-8 h-8 rounded-full bg-gray-600"></div>'
              }
              <div>
                <p class="font-medium">${record.userName || 'Guest'}</p>
                <p class="text-xs text-gray-400">${record.userEmail || record.userId?.slice(-6) || '-'}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              ${typeIcon}
              ${statusBadge}
            </div>
          </td>
          <td class="px-4 py-3 text-sm">
            <div class="flex items-center gap-1 text-gray-400">
              <i class="fas fa-map-marker-alt text-xs"></i>
              <span>${record.location?.city || 'Unknown'}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-2">
              ${record.verified 
                ? '<i class="fas fa-check-circle text-green-400" title="Verified"></i>'
                : `<button onclick="event.stopPropagation(); DataModule.verifyAttendance('${record.id}')" 
                          class="text-gray-400 hover:text-green-400" title="Verify">
                     <i class="fas fa-check"></i>
                   </button>`
              }
              <button onclick="event.stopPropagation(); DataModule.deleteRecord('${record.id}')" 
                      class="text-gray-400 hover:text-red-400" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    this.updatePaginationInfo(start + 1, Math.min(end, state.filteredRecords.length), state.filteredRecords.length);
  },
  
  getStatusBadge(record) {
    const status = record.status || 'hadir';
    const colors = {
      hadir: 'bg-green-500',
      izin: 'bg-yellow-500',
      sakit: 'bg-red-500',
      alpha: 'bg-gray-500'
    };
    
    return `
      <span class="px-2 py-1 rounded-full text-xs font-medium text-white ${colors[status] || colors.hadir}">
        ${status.toUpperCase()}
      </span>
    `;
  },
  
  updatePaginationInfo(start, end, total) {
    DOM.showingStart.textContent = start;
    DOM.showingEnd.textContent = end;
    DOM.totalRecords.textContent = total;
    
    const totalPages = Math.ceil(total / CONFIG.ITEMS_PER_PAGE);
    DOM.pageInfo.textContent = total > 0 ? `${state.currentPage} / ${totalPages}` : '0 / 0';
  },
  
  nextPage() {
    const totalPages = Math.ceil(state.filteredRecords.length / CONFIG.ITEMS_PER_PAGE);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      this.render();
    }
  },
  
  prevPage() {
    if (state.currentPage > 1) {
      state.currentPage--;
      this.render();
    }
  }
};

// ========================================
// STATISTICS MODULE
// ========================================
const StatisticsModule = {
  calculate() {
    // Reset statistics
    const stats = {
      present: 0,
      permit: 0,
      absent: 0,
      total: 0
    };
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Filter today's records
    const todayRecords = state.allRecords.filter(record => {
      const recordDate = new Date(record.timestamp);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });
    
    // Count by status/type
    todayRecords.forEach(record => {
      if (record.type === 'masuk' || record.status === 'hadir') {
        stats.present++;
      } else if (record.status === 'izin') {
        stats.permit++;
      } else if (record.status === 'sakit' || record.status === 'alpha') {
        stats.absent++;
      }
    });
    
    stats.total = todayRecords.length;
    
    // Update UI
    this.updateStatCards(stats);
    
    // Store in state
    state.statistics.today = stats;
  },
  
  updateStatCards(stats) {
    // Animate number changes
    this.animateNumber(DOM.statPresent, stats.present);
    this.animateNumber(DOM.statPermit, stats.permit);
    this.animateNumber(DOM.statAbsent, stats.absent);
    this.animateNumber(DOM.statTotal, stats.total);
  },
  
  animateNumber(element, target) {
    const current = parseInt(element.textContent) || 0;
    const increment = (target - current) / 20;
    let value = current;
    
    const timer = setInterval(() => {
      value += increment;
      if ((increment > 0 && value >= target) || (increment < 0 && value <= target)) {
        element.textContent = target;
        clearInterval(timer);
      } else {
        element.textContent = Math.round(value);
      }
    }, 30);
  }
};

// ========================================
// CHART MODULE
// ========================================
const ChartModule = {
  initialize() {
    const ctx = DOM.attendanceChart?.getContext('2d');
    if (!ctx) return;
    
    state.chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Hadir', 'Izin', 'Tidak Hadir'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: [
            CONFIG.CHART_COLORS.present,
            CONFIG.CHART_COLORS.permit,
            CONFIG.CHART_COLORS.absent
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#e2e8f0',
              padding: 10,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  },
  
  update() {
    if (!state.chartInstance) return;
    
    const stats = state.statistics.today;
    state.chartInstance.data.datasets[0].data = [
      stats.present,
      stats.permit,
      stats.absent
    ];
    state.chartInstance.update();
  }
};

// ========================================
// DETAIL MODULE
// ========================================
const DetailModule = {
  show(recordId) {
    const record = state.allRecords.find(r => r.id === recordId);
    if (!record) return;
    
    state.selectedRecord = record;
    
    // Hide no selection message
    DOM.noSelection.classList.add('hidden');
    DOM.detailInfo.classList.remove('hidden');
    
    // Update photo
    if (record.photoURL || record.photoBase64) {
      DOM.detailPhoto.src = record.photoURL || record.photoBase64;
      DOM.detailPhoto.classList.remove('hidden');
    } else {
      DOM.detailPhoto.classList.add('hidden');
    }
    
    // Update info
    DOM.detailName.textContent = record.userName || 'Guest User';
    DOM.detailTime.textContent = Utils.formatDateTime(record.timestamp);
    
    // Status badge
    const statusBadge = TableModule.getStatusBadge(record);
    DOM.detailStatus.innerHTML = statusBadge;
    
    // Coordinates
    if (record.location) {
      DOM.detailCoords.textContent = `${record.location.lat?.toFixed(4)}, ${record.location.lng?.toFixed(4)}`;
      DOM.mapLink.href = `https://maps.google.com/?q=${record.location.lat},${record.location.lng}`;
      DOM.mapLink.classList.remove('hidden');
    } else {
      DOM.detailCoords.textContent = 'N/A';
      DOM.mapLink.classList.add('hidden');
    }
    
    // Scroll to detail panel on mobile
    if (window.innerWidth < 1024) {
      DOM.detailContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
};

// ========================================
// EXPORT MODULE
// ========================================
const ExportModule = {
  async exportToCSV() {
    if (state.filteredRecords.length === 0) {
      Utils.showNotification('Tidak ada data untuk diexport', 'warning');
      return;
    }
    
    const headers = ['Tanggal', 'Waktu', 'Nama', 'Email', 'Tipe', 'Status', 'Lokasi', 'Koordinat'];
    const rows = state.filteredRecords.map(record => [
      Utils.formatDate(record.timestamp),
      Utils.formatTime(record.timestamp),
      record.userName || '-',
      record.userEmail || '-',
      record.type || '-',
      record.status || 'hadir',
      record.location?.city || '-',
      record.location ? `${record.location.lat},${record.location.lng}` : '-'
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const filename = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    Utils.downloadFile(csv, filename, 'text/csv');
    
    Utils.showNotification('Data berhasil diexport', 'success');
  },
  
  async exportToExcel() {
    // This would require a library like SheetJS
    // For now, we'll export as CSV that can be opened in Excel
    this.exportToCSV();
  },
  
  async exportToPDF() {
    // This would require a library like jsPDF
    // Implementation would go here
    Utils.showNotification('Export PDF dalam pengembangan', 'info');
  }
};

// ========================================
// FILTER MODULE
// ========================================
const FilterModule = {
  initialize() {
    // Date filter
    DOM.filterDate?.addEventListener('change', () => {
      state.filters.dateRange = 'custom';
      this.apply();
    });
    
    // Status filter
    DOM.filterStatus?.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      this.apply();
    });
    
    // Search box
    const debouncedSearch = Utils.debounce(() => {
      state.filters.searchTerm = DOM.searchBox.value;
      this.apply();
    }, 300);
    
    DOM.searchBox?.addEventListener('keyup', debouncedSearch);
  },
  
  apply() {
    DataModule.applyFilters();
    TableModule.render();
    StatisticsModule.calculate();
  },
  
  clear() {
    state.filters = { ...CONFIG.FILTERS };
    
    if (DOM.filterDate) DOM.filterDate.value = '';
    if (DOM.filterStatus) DOM.filterStatus.value = '';
    if (DOM.searchBox) DOM.searchBox.value = '';
    
    this.apply();
    Utils.showNotification('Filter direset', 'info');
  }
};

// ========================================
// DASHBOARD MODULE
// ========================================
const DashboardModule = {
  refreshInterval: null,
  
  async initialize() {
    try {
      // Initialize modules
      FilterModule.initialize();
      ChartModule.initialize();
      
      // Load initial data
      await DataModule.loadAttendanceData();
      
      // Set up auto-refresh
      this.startAutoRefresh();
      
      // Initialize live time
      this.startClock();
      
      console.log('✅ Dashboard initialized');
      
    } catch (error) {
      console.error('Dashboard initialization error:', error);
      Utils.showNotification('Gagal menginisialisasi dashboard', 'error');
    }
  },
  
  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, CONFIG.REFRESH_INTERVAL);
  },
  
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  },
  
  async refresh() {
    // Update live indicator
    const indicator = DOM.liveIndicator;
    indicator.innerHTML = '<i class="fas fa-sync fa-spin text-xs"></i> UPDATING';
    
    // Reload data
    await DataModule.loadAttendanceData();
    
    // Reset indicator
    setTimeout(() => {
      indicator.innerHTML = '<i class="fas fa-circle text-xs"></i> LIVE';
    }, 1000);
  },
  
  startClock() {
    // Update time in header or wherever needed
    setInterval(() => {
      const now = new Date();
      // Update time display if you have one
    }, 1000);
  }
};

// ========================================
// GLOBAL FUNCTIONS
// ========================================
// Make functions available globally for HTML onclick handlers
window.showDetail = (recordId) => DetailModule.show(recordId);
window.deleteRecord = (recordId) => DataModule.deleteRecord(recordId);
window.verifyAttendance = (recordId) => DataModule.verifyAttendance(recordId);
window.prevPage = () => TableModule.prevPage();
window.nextPage = () => TableModule.nextPage();
window.filterData = () => FilterModule.apply();
window.searchData = () => FilterModule.apply();
window.clearFilters = () => FilterModule.clear();
window.exportToExcel = () => ExportModule.exportToCSV();
window.refreshData = () => DashboardModule.refresh();
window.logout = () => AuthModule.logout();

// ========================================
// APP INITIALIZATION
// ========================================
class AdminApp {
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('🚀 Initializing Admin Dashboard...');
      
      // Check if Chart.js is loaded
      if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded, charts will be disabled');
      }
      
      // Initialize authentication
      await AuthModule.initialize();
      
      // Handle page visibility
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          DashboardModule.stopAutoRefresh();
        } else {
          DashboardModule.startAutoRefresh();
        }
      });
      
      // Cleanup on unload
      window.addEventListener('beforeunload', () => {
        if (DataModule.unsubscribe) {
          DataModule.unsubscribe();
        }
      });
      
      this.initialized = true;
      console.log('✅ Admin app initialized');
      
    } catch (error) {
      console.error('❌ Admin app initialization failed:', error);
      Utils.showNotification('Gagal menginisialisasi aplikasi', 'error');
    }
  }
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new AdminApp();
    app.initialize();
  });
} else {
  const app = new AdminApp();
  app.initialize();
}

// Export for debugging
window.__ADMIN_STATE__ = state;
window.__ADMIN_CONFIG__ = CONFIG;
