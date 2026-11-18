/**
 * customer-app.js — Bootstrap & routing untuk order.html
 * Monstar Burgers Self-Order
 */

import { initStorage } from './storage.js';
import { renderAuthPage, getActiveCustomer, logoutCustomer } from './customer-auth.js';
import {
  renderCustomerMenu, setActiveCategory,
  renderCartBar, renderCheckout,
  createCustomerOrder, renderKonfirmasi,
  renderCustomerOrderStatus,
  clearCustomerCart, addToCustomerCart,
  onCustomerCartChange, getCustomerCart,
} from './customer-orders.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast${type !== 'default' ? ` toast--${type}` : ''}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(title, bodyContent) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl  = document.getElementById('modalBody');
  if (!overlay) return;
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.innerHTML = '';
    if (typeof bodyContent === 'string') bodyEl.innerHTML = bodyContent;
    else if (bodyContent instanceof Node) bodyEl.appendChild(bodyContent);
  }
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
}

function bindModalClose() {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// ─── Routing ─────────────────────────────────────────────────────────────────

let currentScreen = null;
let statusPollInterval = null;

function navigateTo(screen) {
  if (currentScreen === screen) return;

  // Sembunyikan semua layar
  document.querySelectorAll('[data-screen]').forEach(el => {
    el.style.display = 'none';
  });

  // Tampilkan layar target
  const target = document.querySelector(`[data-screen="${screen}"]`);
  if (target) target.style.display = '';

  currentScreen = screen;

  // Hentikan polling saat keluar dari layar status
  if (screen !== 'status') {
    if (statusPollInterval) { clearInterval(statusPollInterval); statusPollInterval = null; }
  }

  // Aksi saat masuk layar
  switch (screen) {
    case 'menu': {
      const session = getActiveCustomer();
      const userEl = document.getElementById('menuHeaderUser');
      if (userEl && session) userEl.textContent = `👤 ${session.nama}`;
      renderCustomerMenu();
      renderCartBar();
      break;
    }
    case 'checkout':
      renderCheckout();
      break;
    case 'status':
      renderCustomerOrderStatus();
      // Polling setiap 30 detik
      statusPollInterval = setInterval(renderCustomerOrderStatus, 30_000);
      break;
  }
}

// ─── Bind Events ──────────────────────────────────────────────────────────────

function bindCategoryFilter() {
  const container = document.getElementById('categoryFilter');
  if (!container) return;
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    setActiveCategory(chip.dataset.cat);
  });
}

function bindCartBar() {
  const btn = document.getElementById('cartBarBtn');
  btn?.addEventListener('click', () => {
    if (getCustomerCart().length > 0) navigateTo('checkout');
  });
}

function bindCheckout() {
  // Tombol kembali ke menu
  document.getElementById('checkoutBackBtn')?.addEventListener('click', () => navigateTo('menu'));

  // Tombol Pesan Sekarang
  const placeBtn = document.getElementById('placeOrderBtn');
  const errorEl  = document.getElementById('checkoutError');

  placeBtn?.addEventListener('click', () => {
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    const catatan = document.getElementById('orderNote')?.value || '';

    placeBtn.disabled = true;
    placeBtn.textContent = 'Memproses…';

    try {
      const { nomorPesanan, total } = createCustomerOrder({ catatan });
      clearCustomerCart();
      renderCartBar();
      renderKonfirmasi(nomorPesanan, total);
      navigateTo('konfirmasi');
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
      showToast(err.message, 'error');
    } finally {
      placeBtn.disabled = false;
      placeBtn.textContent = '🧾 Pesan Sekarang';
    }
  });
}

function bindKonfirmasi() {
  document.getElementById('goToStatusBtn')?.addEventListener('click', () => navigateTo('status'));
  document.getElementById('orderAgainBtn')?.addEventListener('click', () => navigateTo('menu'));
}

function bindStatus() {
  document.getElementById('statusBackBtn')?.addEventListener('click', () => navigateTo('menu'));
  document.getElementById('statusRefreshBtn')?.addEventListener('click', () => {
    renderCustomerOrderStatus();
    showToast('Status diperbarui', 'success');
  });
  document.getElementById('statusLogoutBtn')?.addEventListener('click', handleLogout);
}

function bindMenuButtons() {
  document.getElementById('menuLogoutBtn')?.addEventListener('click', handleLogout);
  document.getElementById('menuStatusBtn')?.addEventListener('click', () => navigateTo('status'));
}

function handleLogout() {
  if (confirm('Yakin ingin keluar?')) {
    logoutCustomer();
    clearCustomerCart();
    if (statusPollInterval) clearInterval(statusPollInterval);
    // Reset semua layar lalu tampilkan auth
    document.querySelectorAll('[data-screen]').forEach(el => el.style.display = 'none');
    renderAuthPage(
      document.querySelector('[data-screen="auth"]'),
      onAuthSuccess
    );
    document.querySelector('[data-screen="auth"]').style.display = '';
    currentScreen = 'auth';
  }
}

function onAuthSuccess() {
  navigateTo('menu');
}

// ─── Cart listener ────────────────────────────────────────────────────────────

function bindCartListener() {
  onCustomerCartChange(() => {
    renderCartBar();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Sembunyikan semua layar dulu
  document.querySelectorAll('[data-screen]').forEach(el => el.style.display = 'none');

  // Init storage (seed data)
  try {
    await initStorage();
  } catch (err) {
    alert('Gagal memuat data: ' + err.message);
    return;
  }

  // Bind modal close
  bindModalClose();

  // Bind semua event
  bindCategoryFilter();
  bindCartBar();
  bindCheckout();
  bindKonfirmasi();
  bindStatus();
  bindMenuButtons();
  bindCartListener();

  // Cek sesi aktif
  const session = getActiveCustomer();

  if (session) {
    navigateTo('menu');
  } else {
    // Render halaman auth
    const authScreen = document.querySelector('[data-screen="auth"]');
    renderAuthPage(authScreen, onAuthSuccess);
    authScreen.style.display = '';
    currentScreen = 'auth';
  }
}

document.addEventListener('DOMContentLoaded', init);
