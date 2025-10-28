// password-auth.js
import { app, auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

/**
 * Elemen DOM
 */
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginStatus = document.getElementById('login-status');

// --- Event: klik tombol login ---
loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showStatus('Harap isi email dan kata sandi.', true);
    return;
  }

  loginBtn.disabled = true;
  showStatus('Sedang memproses...', false);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showStatus('Login berhasil! Mengarahkan...', false);

    // redirect sederhana ke halaman dashboard
    window.location.href = './employee.html';
  } catch (error) {
    const msg = error.code === 'auth/user-not-found'
      ? 'Pengguna tidak ditemukan.'
      : error.code === 'auth/wrong-password'
      ? 'Kata sandi salah.'
      : error.message;
    showStatus(`Gagal: ${msg}`, true);
  } finally {
    loginBtn.disabled = false;
  }
});

// --- Memantau status login ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('Sudah login sebagai:', user.email || user.uid);
  } else {
    console.log('Belum login.');
  }
});

// --- Fungsi logout (bisa dipanggil di halaman lain) ---
export async function userLogout() {
  await signOut(auth);
  window.location.href = './login.html';
}

/**
 * Utility menampilkan status di bawah tombol login
 */
function showStatus(message, isError) {
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? '#f87171' : '#a1a1aa'; // merah/hitam abu
}
