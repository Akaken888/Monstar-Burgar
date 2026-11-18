/**
 * customer-orders.js — Keranjang & pesanan pelanggan
 * Monstar Burgers Self-Order
 */

import {
  getMenu, getMenuById,
  generateNomorPesanan, saveOrder, savePayment,
  getOrdersByCustomer, getPaymentByNomor,
  appendAuditLog,
} from './storage.js';
import { getActiveCustomer } from './customer-auth.js';
import { formatRupiah, formatWaktu, formatMenit } from './utils.js';

// ─── State Keranjang ──────────────────────────────────────────────────────────

let cart = []; // [{ menuId, nama, harga, jumlah, catatan? }]
let cartChangeListeners = [];

export function onCustomerCartChange(fn) { cartChangeListeners.push(fn); }

function notifyCart() { cartChangeListeners.forEach(fn => fn([...cart])); }

export function getCustomerCart() { return [...cart]; }

export function getCustomerCartTotal() {
  return cart.reduce((s, i) => s + i.harga * i.jumlah, 0);
}

export function getCustomerCartCount() {
  return cart.reduce((s, i) => s + i.jumlah, 0);
}

export function addToCustomerCart(menuItem) {
  const existing = cart.find(i => i.menuId === menuItem.id);
  if (existing) {
    existing.jumlah += 1;
  } else {
    cart.push({ menuId: menuItem.id, nama: menuItem.nama, harga: menuItem.harga, jumlah: 1 });
  }
  notifyCart();
}

export function changeCustomerQty(menuId, delta) {
  const idx = cart.findIndex(i => i.menuId === menuId);
  if (idx === -1) return;
  cart[idx].jumlah += delta;
  if (cart[idx].jumlah <= 0) cart.splice(idx, 1);
  notifyCart();
}

export function clearCustomerCart() {
  cart = [];
  notifyCart();
}

// ─── Render Menu Grid ─────────────────────────────────────────────────────────

let activeCat = 'Semua';

export function setActiveCategory(cat) {
  activeCat = cat;
  renderCustomerMenu();
}

export function renderCustomerMenu() {
  const grid = document.getElementById('menuGridCustomer');
  if (!grid) return;

  const menu = getMenu();
  const filtered = activeCat === 'Semua' ? menu : menu.filter(m => m.kategori === activeCat);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">🍽️</span>
      <p>Tidak ada menu di kategori ini.</p>
    </div>`;
    return;
  }

  // Kelompokkan per kategori jika filter "Semua"
  const groups = {};
  filtered.forEach(item => {
    if (!groups[item.kategori]) groups[item.kategori] = [];
    groups[item.kategori].push(item);
  });

  Object.entries(groups).forEach(([kat, items]) => {
    if (activeCat === 'Semua') {
      const title = document.createElement('div');
      title.className = 'menu-section__title';
      title.textContent = kat;
      grid.appendChild(title);
    }

    const gridRow = document.createElement('div');
    gridRow.className = 'menu-grid';

    items.forEach(item => {
      const cartItem = cart.find(c => c.menuId === item.id);
      const qty = cartItem ? cartItem.jumlah : 0;

      const card = document.createElement('div');
      card.className = 'menu-card';
      card.setAttribute('role', 'listitem');
      if (!item.tersedia) card.setAttribute('disabled', '');

      // Foto dari Unsplash berdasarkan nama menu
      const imgUrl = getMenuImage(item.nama);

      card.innerHTML = `
        ${imgUrl
          ? `<img class="menu-card__img" src="${imgUrl}" alt="${esc(item.nama)}" loading="lazy" />`
          : `<div class="menu-card__img--placeholder" aria-hidden="true">${getMenuEmoji(item.kategori)}</div>`
        }
        <div class="menu-card__body">
          <div class="menu-card__name">${esc(item.nama)}</div>
          <div class="menu-card__price">${formatRupiah(item.harga)}</div>
          ${!item.tersedia ? '<span class="menu-card__badge-habis">Habis</span>' : ''}
        </div>
        <div class="menu-card__qty-row">
          ${item.tersedia
            ? (qty > 0
                ? `<button class="qty-btn" data-action="minus" data-id="${item.id}" aria-label="Kurangi ${esc(item.nama)}">−</button>
                   <span class="qty-count" aria-label="${qty} porsi">${qty}</span>
                   <button class="qty-btn qty-btn--add" data-action="plus" data-id="${item.id}" aria-label="Tambah ${esc(item.nama)}">+</button>`
                : `<span style="flex:1"></span>
                   <button class="qty-btn qty-btn--add" data-action="plus" data-id="${item.id}" aria-label="Tambah ${esc(item.nama)}">+</button>`
              )
            : `<span style="font-size:12px;color:var(--color-text-muted);">Tidak tersedia</span>`
          }
        </div>
      `;

      // Bind qty buttons
      card.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!item.tersedia) return;
          const delta = btn.dataset.action === 'plus' ? 1 : -1;
          if (delta === 1 && qty === 0) {
            addToCustomerCart(item);
          } else {
            changeCustomerQty(item.id, delta);
          }
          renderCustomerMenu(); // re-render untuk update qty display
        });
      });

      gridRow.appendChild(card);
    });

    grid.appendChild(gridRow);
  });
}

// ─── Render Cart Bar ──────────────────────────────────────────────────────────

export function renderCartBar() {
  const btn = document.getElementById('cartBarBtn');
  const countEl = document.getElementById('cartBarCount');
  const totalEl = document.getElementById('cartBarTotal');
  if (!btn) return;

  const count = getCustomerCartCount();
  const total = getCustomerCartTotal();

  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = formatRupiah(total);
  btn.disabled = count === 0;
}

// ─── Render Checkout ──────────────────────────────────────────────────────────

export function renderCheckout() {
  const container = document.getElementById('checkoutItems');
  const totalEl = document.getElementById('checkoutTotal');
  if (!container) return;

  container.innerHTML = '';

  if (cart.length === 0) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;">Keranjang kosong.</p>';
    return;
  }

  cart.forEach(item => {
    const div = document.createElement('div');
    div.className = 'checkout-item';
    div.innerHTML = `
      <span class="checkout-item__qty">${item.jumlah}×</span>
      <span class="checkout-item__name">${esc(item.nama)}</span>
      <span class="checkout-item__sub">${formatRupiah(item.harga * item.jumlah)}</span>
    `;
    container.appendChild(div);
  });

  if (totalEl) totalEl.textContent = formatRupiah(getCustomerCartTotal());
}

// ─── Buat Pesanan ─────────────────────────────────────────────────────────────

/**
 * Buat pesanan baru dari keranjang pelanggan.
 * Harga di-re-verify dari storage sebelum disimpan.
 */
export function createCustomerOrder({ catatan = '' } = {}) {
  const session = getActiveCustomer();
  if (!session) throw new Error('Sesi tidak aktif. Silakan login ulang.');
  if (cart.length === 0) throw new Error('Keranjang masih kosong.');

  // Re-verify harga & ketersediaan
  const verifiedItems = cart.map(cartItem => {
    const menuItem = getMenuById(cartItem.menuId);
    if (!menuItem) throw new Error(`Menu "${cartItem.nama}" tidak lagi tersedia.`);
    if (!menuItem.tersedia) throw new Error(`"${menuItem.nama}" sudah habis. Hapus dari keranjang dan coba lagi.`);
    return {
      menuId: menuItem.id,
      nama: menuItem.nama,
      harga: menuItem.harga,   // Harga resmi dari storage, bukan dari cart
      jumlah: cartItem.jumlah,
    };
  });

  const total = verifiedItems.reduce((s, i) => s + i.harga * i.jumlah, 0);
  const nomorPesanan = generateNomorPesanan();
  const now = nowJakarta();

  const order = {
    nomorPesanan,
    waktuMasuk: now,
    saluran: 'Self-Order',
    sumber: 'self-order',
    customerId: session.userId,
    namaPelanggan: session.nama,
    catatan: catatan.trim() || null,
    items: verifiedItems,
    total,
    statusPengerjaan: 'Menunggu',
    dibatalkan: false,
    alasanBatal: null,
    waktuBatal: null,
    dibatalkanOleh: null,
  };

  const payment = {
    id: 'pay_' + nomorPesanan,
    nomorPesanan,
    metode: 'QRIS',
    nominal: total,
    uangDiterima: null,
    kembalian: null,
    status: 'Menunggu Konfirmasi',
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
    aktor: session.nama,
  });

  return { nomorPesanan, total };
}

// ─── Render Konfirmasi ────────────────────────────────────────────────────────

export function renderKonfirmasi(nomorPesanan, total) {
  const el = document.getElementById('konfirmasiDetail');
  if (!el) return;

  const session = getActiveCustomer();
  el.innerHTML = `
    <div class="konfirmasi-card__row">
      <span class="konfirmasi-card__label">Nomor Pesanan</span>
      <span class="konfirmasi-card__val">${esc(nomorPesanan)}</span>
    </div>
    <div class="konfirmasi-card__row">
      <span class="konfirmasi-card__label">Nama</span>
      <span class="konfirmasi-card__val">${esc(session?.nama || '—')}</span>
    </div>
    <div class="konfirmasi-card__row konfirmasi-card__total" style="border-top:1px solid var(--color-border);padding-top:12px;margin-top:4px;">
      <span class="konfirmasi-card__label" style="font-weight:700;">Total Bayar</span>
      <span class="konfirmasi-card__val" style="font-size:20px;color:var(--color-primary);">${formatRupiah(total)}</span>
    </div>
  `;
}

// ─── Render Status Pesanan ────────────────────────────────────────────────────

const STATUS_STEPS = ['Menunggu', 'Diproses', 'Siap Diambil', 'Selesai'];

const STATUS_LABEL = {
  'Menunggu':     '⏳ Menunggu konfirmasi pembayaran',
  'Diproses':     '👨‍🍳 Sedang dimasak',
  'Siap Diambil': '🎉 Siap diambil!',
  'Selesai':      '✅ Selesai',
  'Dibatalkan':   '❌ Dibatalkan',
};

const STATUS_BANNER_CLASS = {
  'Menunggu':     'status-banner--waiting',
  'Diproses':     'status-banner--process',
  'Siap Diambil': 'status-banner--ready',
  'Selesai':      'status-banner--done',
  'Dibatalkan':   'status-banner--cancelled',
};

export function renderCustomerOrderStatus() {
  const container = document.getElementById('orderCards');
  const lastUpdate = document.getElementById('statusLastUpdate');
  if (!container) return;

  const session = getActiveCustomer();
  if (!session) return;

  const orders = getOrdersByCustomer(session.userId)
    .sort((a, b) => new Date(b.waktuMasuk) - new Date(a.waktuMasuk));

  if (lastUpdate) {
    const now = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
    lastUpdate.textContent = `Diperbarui ${now}`;
  }

  container.innerHTML = '';

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🛍️</span>
        <p>Belum ada pesanan.<br>Yuk, pesan sekarang!</p>
      </div>`;
    return;
  }

  orders.forEach(order => {
    const payment = getPaymentByNomor(order.nomorPesanan);
    const payStatus = payment ? payment.status : 'Belum Dibayar';
    const statusKey = order.dibatalkan ? 'Dibatalkan' : order.statusPengerjaan;
    const menit = Math.floor((Date.now() - new Date(order.waktuMasuk).getTime()) / 60000);

    const card = document.createElement('div');
    card.className = 'order-card';

    // Header
    card.innerHTML = `
      <div class="order-card__header">
        <div>
          <div class="order-card__nomor">${esc(order.nomorPesanan)}</div>
          <div class="order-card__time">${formatWaktu(order.waktuMasuk)} · ${formatMenit(menit)} lalu</div>
        </div>
        <div class="order-card__badges">
          <span class="badge ${payBadgeClass(payStatus)}">${payStatus}</span>
        </div>
      </div>

      <!-- Status banner -->
      <div class="status-banner ${STATUS_BANNER_CLASS[statusKey] || ''}">
        ${STATUS_LABEL[statusKey] || statusKey}
      </div>

      <!-- Progress steps (hanya untuk pesanan aktif, bukan dibatalkan) -->
      ${!order.dibatalkan ? buildProgressBar(order.statusPengerjaan) : ''}

      <!-- Item list -->
      <div class="order-card__body">
        <div class="order-card__items">
          ${order.items.map(i =>
            `<div class="order-card__item">
              <span class="order-card__item-qty">${i.jumlah}×</span>
              <span>${esc(i.nama)}</span>
            </div>`
          ).join('')}
        </div>
        ${order.catatan ? `<div style="margin-top:8px;font-size:12px;color:var(--color-text-muted);font-style:italic;">📝 ${esc(order.catatan)}</div>` : ''}
      </div>

      <!-- Footer -->
      <div class="order-card__footer">
        <span style="font-size:13px;color:var(--color-text-muted);">
          ${order.dibatalkan ? `Alasan: ${esc(order.alasanBatal || '—')}` : ''}
        </span>
        <span class="order-card__total">${formatRupiah(order.total)}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

function buildProgressBar(currentStatus) {
  const steps = STATUS_STEPS;
  const currentIdx = steps.indexOf(currentStatus);

  let html = '<div class="status-progress" aria-label="Status pengerjaan">';

  steps.forEach((step, idx) => {
    const isDone = idx < currentIdx;
    const isActive = idx === currentIdx;
    const dotClass = isDone ? 'status-step__dot--done' : (isActive ? 'status-step__dot--active' : '');
    const labelClass = isDone ? 'status-step__label--done' : (isActive ? 'status-step__label--active' : '');
    const shortLabel = { 'Menunggu': 'Menunggu', 'Diproses': 'Dimasak', 'Siap Diambil': 'Siap', 'Selesai': 'Selesai' };

    if (idx > 0) {
      const lineClass = idx <= currentIdx ? 'status-step__line--done' : '';
      html += `<div class="status-step__line ${lineClass}"></div>`;
    }

    html += `
      <div class="status-step">
        <div class="status-step__dot ${dotClass}"></div>
        <div class="status-step__label ${labelClass}">${shortLabel[step] || step}</div>
      </div>`;
  });

  html += '</div>';
  return html;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function payBadgeClass(status) {
  const map = {
    'Belum Dibayar':       'badge-pay--Belum',
    'Menunggu Konfirmasi': 'badge-pay--Pending',
    'Lunas':               'badge-pay--Lunas',
  };
  return map[status] || 'badge--gray';
}

function getMenuImage(nama) {
  // Unsplash foto burger/makanan berdasarkan nama menu
  const map = {
    'Wimpy':                   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=70&auto=format',
    'Cheese Burger':           'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=70&auto=format',
    'Double Cheese Burger':    'https://images.unsplash.com/photo-1586816001966-79b736744398?w=400&q=70&auto=format',
    'Eggy':                    'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&q=70&auto=format',
    'Classic Chicken Sandwich':'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&q=70&auto=format',
    'Nashville Chicken Sandwich':'https://images.unsplash.com/photo-1562802378-063ec186a863?w=400&q=70&auto=format',
    'Fries OG':                'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=70&auto=format',
    'Cheese Fries':            'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&q=70&auto=format',
    'Beef & Cheese Fries':     'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=400&q=70&auto=format',
    'Chicken Fries':           'https://images.unsplash.com/photo-1598679253544-2c97992403ea?w=400&q=70&auto=format',
  };
  return map[nama] || null;
}

function getMenuEmoji(kategori) {
  return kategori === 'Kentang Goreng' ? '🍟' : '🍔';
}

function nowJakarta() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
