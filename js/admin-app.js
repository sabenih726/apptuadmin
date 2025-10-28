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

const tbody = document.getElementById('attendance-table-body');
const verifPhoto = document.getElementById('verification-photo');
const noPhotoMsg = document.getElementById('no-photo-msg');
const verifStatus = document.getElementById('verif-status');
const verifTime = document.getElementById('verif-time');
const verifCoords = document.getElementById('verif-coords');
const verifMap = document.getElementById('verif-map-link');

let allRecords = [];

async function handleAuth() {
  onAuthStateChanged(auth, user => {
    if (user) loadData();
    else signInAnonymously(auth);
  });
  if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token)
    await signInWithCustomToken(auth, __initial_auth_token);
}

function loadData() {
  const q = query(collection(db, getCollectionPath()));
  onSnapshot(q, snap => {
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" align="center">Tidak ada data</td></tr>';
      return;
    }
    allRecords = snap.docs.map(d => ({
      ...d.data(),
      id: d.id,
      timestamp: d.data().timestamp?.toDate?.() || new Date(0)
    })).sort((a,b) => b.timestamp - a.timestamp);
    renderTable();
    renderDetail(allRecords[0]);
  });
}

function renderTable() {
  tbody.innerHTML = allRecords.map(r => `
    <tr class="hover:bg-gray-700">
      <td>${r.timestamp.toLocaleString('id-ID')}</td>
      <td class="${r.type==='IN'?'text-green-400':'text-yellow-400'}">${r.type}</td>
      <td>...${r.userId.slice(-6)}</td>
      <td>${r.locationName}</td>
      <td><button onclick="viewDetail('${r.id}')" class="text-blue-400">Detail</button></td>
    </tr>`).join('');
}

function renderDetail(r) {
  if (!r) {
    noPhotoMsg.classList.remove('hidden'); verifPhoto.classList.add('hidden'); return;
  }
  noPhotoMsg.classList.add('hidden'); verifPhoto.classList.remove('hidden');
  verifPhoto.src = r.photoBase64 || 'https://placehold.co/150x100';
  verifStatus.textContent = `${r.type} oleh ...${r.userId.slice(-6)}`;
  verifTime.textContent = r.timestamp.toLocaleString('id-ID');
  verifCoords.textContent = `${r.coordinates.latitude}, ${r.coordinates.longitude}`;
  verifMap.href = `https://www.google.com/maps?q=${r.coordinates.latitude},${r.coordinates.longitude}`;
}

window.viewDetail = (id) => {
  const rec = allRecords.find(r => r.id === id);
  renderDetail(rec);
};

handleAuth();
