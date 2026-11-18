/**
 * orders.js — Logika input & manajemen pesanan
 * Monstar Burgers Order Manager
 */

import {
  generateNomorPesanan, saveOrder, savePayment,
  updateOrderStatus as dalUpdateStatus,
  cancelOrder as dalCancelOrder,
  getOrderByNomor, getPaymentByNomor,
  appendAuditLog,
} from './storage.js';
import { getActiveName } from './auth.js';
import { formatRupiah } from './utils.js';

// ─── State Keranjang ──────────────────────────────────────────────────────────

let cartItems = []; // [{ menuId, nama, harga, jumlah }]
let cartListeners = [];

function notifyCartListeners() {
  cartListeners.forEach(fn => fn([...cartItems]));
}

export function onCartChange(fn) {
  cartListeners.push(fn);
}

export function getCart() { return [...cartItems]; }

export function addToCart(menuItem) {
  const existing = cartItems.find(i => i.menuId === menuItem.id);
  if (existing) {
    existing.jumlah += 1;
  } else {
    cartItems.push({
      menuId: menuItem.id,
      nama: menuItem.nama,
      harga: menuItem.harga,
      jumlah: 1,
    });
  }
  notifyCartListeners();
}

export function changeQty(menuId, delta) {
  const idx = cartItems.findIndex(i => i.menuId === menuId);
  if (idx === -1) return;
  cartItems[idx].jumlah += delta;
  if (cartItems[idx].jumlah <= 0) cartItems.splice(idx, 1);
  notifyCartListeners();
}

export function clearCart() {
  cartItems = [];
  notifyCartListeners();
}

export function getCartTotal() {
  return cartItems.reduce((s, i) => s + i.harga * i.jumlah, 0);
}

// ─── Render Keranjang ─────────────────────────────────────────────────────────

export function renderCart() {
  const container = document.getElementById('cartItems');
  const emptyEl   = document.getElementById('cartEmpty');
  const totalEl   = document.getElementById('cartTotal');
  const totalAmt  = document.getElementById('cartTotalAmount');
  const badgeEl   = document.getElementById('cartBadge');
  if (!container) return;

  if (cartItems.length === 0) {
    // Show empty state
    container.innerHTML = '';
    const emp = document.createElement('div');
    emp.className = 'empty-state';
    emp.id = 'cartEmpty';
    emp.innerHTML = '<span class="empty-state__icon" aria-hidden="true">🛒</span><p>Keranjang kosong.<br>Pilih menu di sebelah.</p>';
    container.appendChild(emp);
    if (totalEl) totalEl.hidden = true;
    if (badgeEl) badgeEl.hidden = true;
    return;
  }

  container.innerHTML = '';
  cartItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <span class="cart-item__name">${escHtml(item.nama)}</span>
      <div class="cart-item__controls">
        <button type="button" class="cart-item__qty-btn" data-action="minus" data-id="${item.menuId}" aria-label="Kurangi ${escHtml(item.nama)}">−</button>
        <span class="cart-item__qty" aria-label="${item.jumlah} porsi">${item.jumlah}</span>
        <button type="button" class="cart-item__qty-btn" data-action="plus" data-id="${item.menuId}" aria-label="Tambah ${escHtml(item.nama)}">+</button>
      </div>
      <span class="cart-item__sub">${formatRupiah(item.harga * item.jumlah)}</span>
    `;
    container.appendChild(div);
  });

  // Bind qty buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const delta = btn.dataset.action === 'plus' ? 1 : -1;
      changeQty(id, delta);
      renderCart();
    });
  });

  if (totalEl) totalEl.hidden = false;
  if (totalAmt) totalAmt.textContent = formatRupiah(getCartTotal());
  if (badgeEl) {
    const totalQty = cartItems.reduce((s, i) => s + i.jumlah, 0);
    badgeEl.textContent = totalQty;
    badgeEl.hidden = false;
  }
}

// ─── Create Order ─────────────────────────────────────────────────────────────

/**
 * Buat pesanan baru dari data form + isi keranjang.
 * @param {{ saluran, namaPelanggan, catatan, metodeBayar }} formData
 * @returns {{ nomorPesanan: string }}
 */
export function createOrder(formData) {
  if (cartItems.length === 0) throw new Error('Keranjang masih kosong.');
  if (!formData.saluran) throw new Error('Pilih saluran pesanan (Langsung / WhatsApp).');
  if (!formData.metodeBayar) throw new Error('Pilih metode pembayaran (Tunai / QRIS).');

  const nomorPesanan = generateNomorPesanan();
  const total = getCartTotal();
  const aktor = getActiveName();

  // Snapshot items (harga saat ini)
  const items = cartItems.map(i => ({
    menuId: i.menuId,
    nama: i.nama,
    harga: i.harga,
    jumlah: i.jumlah,
  }));

  const order = {
    nomorPesanan,
    waktuMasuk: nowJakarta(),
    saluran: formData.saluran,
    namaPelanggan: formData.namaPelanggan?.trim() || null,
    catatan: formData.catatan?.trim() || null,
    items,
    total,
    statusPengerjaan: 'Menunggu',
    dibatalkan: false,
    alasanBatal: null,
    waktuBatal: null,
    dibatalkanOleh: null,
  };

  // Tentukan status payment awal
  let payStatus;
  if (formData.metodeBayar === 'QRIS') {
    payStatus = 'Menunggu Konfirmasi';
  } else {
    payStatus = 'Belum Dibayar';
  }

  const payment = {
    id: 'pay_' + nomorPesanan,
    nomorPesanan,
    metode: formData.metodeBayar,
    nominal: total,
    uangDiterima: null,
    kembalian: null,
    status: payStatus,
    waktuVerifikasi: null,
    dikonfirmasiOleh: null,
    referensi: null,
  };

  saveOrder(order);
  savePayment(payment);

  appendAuditLog({
    nomorPesanan,
    aksi: 'PESANAN_DIBUAT',
    nilaiLama: null,
    nilaiBaru: 'Menunggu',
    aktor,
  });

  return { nomorPesanan };
}

// ─── Advance Status ───────────────────────────────────────────────────────────

const STATUS_SEQUENCE = ['Menunggu', 'Diproses', 'Siap Diambil', 'Selesai'];

/**
 * Majukan status pengerjaan ke tahap berikutnya.
 * @throws jika pesanan belum Lunas dan ingin masuk Diproses.
 */
export function advanceOrderStatus(nomorPesanan) {
  const order = getOrderByNomor(nomorPesanan);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.dibatalkan) throw new Error('Pesanan sudah dibatalkan.');

  const curIdx = STATUS_SEQUENCE.indexOf(order.statusPengerjaan);
  if (curIdx === -1 || curIdx === STATUS_SEQUENCE.length - 1) {
    throw new Error('Pesanan sudah di status terakhir.');
  }

  const nextStatus = STATUS_SEQUENCE[curIdx + 1];

  // Blokir masuk Diproses jika belum Lunas
  if (nextStatus === 'Diproses') {
    const payment = getPaymentByNomor(nomorPesanan);
    if (!payment || payment.status !== 'Lunas') {
      throw new Error('PAYMENT_REQUIRED');
    }
  }

  const aktor = getActiveName();
  dalUpdateStatus(nomorPesanan, nextStatus);

  appendAuditLog({
    nomorPesanan,
    aksi: 'STATUS_PENGERJAAN_BERUBAH',
    nilaiLama: order.statusPengerjaan,
    nilaiBaru: nextStatus,
    aktor,
  });

  return nextStatus;
}

/** Kembalikan label tombol maju status berikutnya. */
export function getNextStatusLabel(currentStatus) {
  const labels = {
    'Menunggu':    '▶ Proses',
    'Diproses':    '✔ Siap Diambil',
    'Siap Diambil':'✅ Selesai',
  };
  return labels[currentStatus] || null;
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────

const CANCELABLE_STATUSES = ['Menunggu', 'Diproses'];

export function cancelOrder(nomorPesanan, alasan) {
  const order = getOrderByNomor(nomorPesanan);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.dibatalkan) throw new Error('Pesanan sudah dibatalkan sebelumnya.');
  if (!CANCELABLE_STATUSES.includes(order.statusPengerjaan)) {
    throw new Error(`Pesanan berstatus "${order.statusPengerjaan}" tidak dapat dibatalkan.`);
  }
  if (!alasan || alasan.trim().length < 5) {
    throw new Error('Alasan pembatalan minimal 5 karakter.');
  }

  const aktor = getActiveName();
  dalCancelOrder(nomorPesanan, alasan.trim(), aktor);

  appendAuditLog({
    nomorPesanan,
    aksi: 'PESANAN_DIBATALKAN',
    nilaiLama: order.statusPengerjaan,
    nilaiBaru: 'Dibatalkan',
    aktor,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function nowJakarta() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
