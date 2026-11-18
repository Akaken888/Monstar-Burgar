/**
 * app.js — Bootstrap, routing SPA, event global
 * Monstar Burgers Order Manager
 */

import { initStorage, getOrdersByCustomer, getPaymentByNomor,
  generateNomorPesanan, saveOrder, savePayment, appendAuditLog,
  getMenu, getMenuById,
} from './storage.js';
import {
  renderLoginPage, bindLoginEvents,
  getActiveSession, logout as authLogout,
  getActiveCustomer, logoutCustomer,
} from './auth.js';
import {
  renderMenuGrid, bindCategoryChips, onMenuClick,
  renderMenuManage, addMenuItem, editMenuItem, getKategoriList,
} from './menu.js';
import {
  addToCart, onCartChange, renderCart, clearCart, createOrder,
} from './orders.js';
import {
  renderQueueBoard, startQueueTimer, stopQueueTimer,
  setRenderPaymentList as queueSetPayFn,
} from './queue.js';
import {
  renderPaymentList, bindPaymentTabs,
  setRenderQueueBoard as paySetQueueFn,
} from './payments.js';
import { renderReports } from './reports.js';
import { formatRupiah, formatWaktu, formatMenit, escHtml } from './utils.js';
import { showToast, openModal, closeModal, bindModalClose } from './ui.js';

export { showToast, openModal, closeModal };

// ─── State keranjang customer ─────────────────────────────────────────────────

let custCart = [];

function custCartTotal() { return custCart.reduce((s, i) => s + i.harga * i.jumlah, 0); }
function custCartCount() { return custCart.reduce((s, i) => s + i.jumlah, 0); }

function custAddItem(menuItem) {
  const ex = custCart.find(i => i.menuId === menuItem.id);
  if (ex) ex.jumlah += 1;
  else custCart.push({ menuId: menuItem.id, nama: menuItem.nama, harga: menuItem.harga, jumlah: 1 });
  renderCustCart();
}

function custChangeQty(menuId, delta) {
  const idx = custCart.findIndex(i => i.menuId === menuId);
  if (idx === -1) return;
  custCart[idx].jumlah += delta;
  if (custCart[idx].jumlah <= 0) custCart.splice(idx, 1);
  renderCustCart();
}

// ─── Routing ──────────────────────────────────────────────────────────────────

let currentPage = null;
let statusPollInterval = null;

function navigate(page) {
  if (currentPage === page) return;

  document.querySelectorAll('#appMain .page').forEach(p => p.classList.remove('active'));
  const target = document.querySelector(`#appMain [data-page="${page}"]`);
  if (target) target.classList.add('active');

  document.querySelectorAll('[data-nav]').forEach(btn => {
    const isActive = btn.dataset.nav === page;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'true' : 'false');
  });

  if (page !== 'antrean') stopQueueTimer();
  if (page !== 'customer-status' && statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }

  currentPage = page;

  switch (page) {
    case 'kasir':
      renderMenuGrid();
      renderCart();
      break;
    case 'antrean':
      renderQueueBoard();
      startQueueTimer();
      break;
    case 'pembayaran':
      renderPaymentList();
      break;
    case 'laporan':
      renderReports();
      break;
    case 'menu':
      renderMenuManage(openEditMenuModal, openAddMenuModal);
      break;
    case 'customer-pesan':
      renderCustMenuGrid();
      renderCustCart();
      break;
    case 'customer-status':
      renderCustOrderStatus();
      if (!statusPollInterval) {
        statusPollInterval = setInterval(renderCustOrderStatus, 30_000);
      }
      break;
  }
}

// ─── Tampilan berdasarkan peran ───────────────────────────────────────────────

function applyRoleUI(peran) {
  const isOwner = peran === 'owner';

  // Sembunyikan/tampilkan nav items
  document.querySelectorAll('.nav-owner-only').forEach(el => {
    el.hidden = !isOwner;
  });
  document.querySelectorAll('.nav-customer-only').forEach(el => {
    el.hidden = isOwner;
  });

  // Update header badge peran
  const userEl = document.getElementById('headerUsername');
  if (userEl) {
    const session = isOwner ? getActiveSession() : getActiveCustomer();
    const nama = session?.nama || '';
    const badge = isOwner ? '' : ' <span style="font-size:10px;background:rgba(255,255,255,.2);padding:1px 6px;border-radius:9999px;">Pelanggan</span>';
    userEl.innerHTML = `👤 ${escHtml(nama)}${badge}`;
  }
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

let loginEventsBound = false;

function showLoginPage() {
  document.querySelector('[data-page="login"]').style.display = 'flex';
  document.getElementById('appShell').hidden = true;
  renderLoginPage();
  if (!loginEventsBound) {
    bindLoginEvents(onLoginSuccess);
    loginEventsBound = true;
  }
}

function onLoginSuccess(peran) {
  document.querySelector('[data-page="login"]').style.display = 'none';
  document.getElementById('appShell').removeAttribute('hidden');
  applyRoleUI(peran);

  if (peran === 'owner') {
    navigate('kasir');
  } else {
    navigate('customer-pesan');
  }
}

function bindLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (!confirm('Yakin ingin keluar?')) return;
    const isCustomer = !!getActiveCustomer();
    if (isCustomer) {
      logoutCustomer();
      custCart = [];
    } else {
      authLogout();
      clearCart();
    }
    if (statusPollInterval) { clearInterval(statusPollInterval); statusPollInterval = null; }
    showLoginPage();
  });
}

// ─── Owner: Order Form ────────────────────────────────────────────────────────

function bindOrderForm() {
  const form = document.getElementById('orderForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('orderFormError');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    const data = new FormData(form);
    try {
      const { nomorPesanan } = createOrder({
        saluran: data.get('saluran'),
        metodeBayar: data.get('metodeBayar'),
        namaPelanggan: data.get('namaPelanggan') || '',
        catatan: data.get('catatan') || '',
      });
      clearCart();
      renderCart();
      form.reset();
      showToast(`✅ Pesanan ${nomorPesanan} berhasil dibuat!`, 'success');
      setTimeout(() => navigate('antrean'), 1500);
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
      showToast(err.message, 'error');
    }
  });
}

// ─── Customer: Render Menu ────────────────────────────────────────────────────

let custActiveCat = 'Semua';

function renderCustMenuGrid() {
  const grid = document.getElementById('custMenuGrid');
  if (!grid) return;

  const menu = getMenu();
  const filtered = custActiveCat === 'Semua'
    ? menu : menu.filter(m => m.kategori === custActiveCat);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state__icon">🍽️</span><p>Tidak ada menu.</p></div>`;
    return;
  }

  // Kelompokkan per kategori
  const groups = {};
  filtered.forEach(item => {
    if (!groups[item.kategori]) groups[item.kategori] = [];
    groups[item.kategori].push(item);
  });

  Object.entries(groups).forEach(([kat, items]) => {
    if (custActiveCat === 'Semua') {
      const title = document.createElement('div');
      title.style.cssText = 'padding:8px 0 4px;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-muted);';
      title.textContent = kat;
      grid.appendChild(title);
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:8px;';

    items.forEach(item => {
      const inCart = custCart.find(c => c.menuId === item.id);
      const qty = inCart ? inCart.jumlah : 0;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-btn';
      btn.disabled = !item.tersedia;
      btn.setAttribute('role', 'listitem');
      btn.innerHTML = `
        <span class="menu-btn__name">${escHtml(item.nama)}</span>
        <span class="menu-btn__price">${formatRupiah(item.harga)}</span>
        ${!item.tersedia ? '<span class="menu-btn__badge">Habis</span>' : ''}
        ${qty > 0 ? `<span style="position:absolute;top:6px;right:6px;background:var(--color-primary);color:#fff;border-radius:9999px;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;padding:0 4px;">${qty}</span>` : ''}
      `;
      if (item.tersedia) {
        btn.addEventListener('click', () => custAddItem(item));
      }
      row.appendChild(btn);
    });

    grid.appendChild(row);
  });
}

// ─── Customer: Render Cart ────────────────────────────────────────────────────

function renderCustCart() {
  const container = document.getElementById('custCartItems');
  const totalEl   = document.getElementById('custCartTotal');
  const totalAmt  = document.getElementById('custCartTotalAmount');
  const badgeEl   = document.getElementById('custCartBadge');
  const submitBtn = document.getElementById('custCreateOrderBtn');
  if (!container) return;

  if (custCart.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state__icon" aria-hidden="true">🛒</span><p>Keranjang kosong.<br>Pilih menu di sebelah.</p></div>`;
    if (totalEl) totalEl.hidden = true;
    if (badgeEl) badgeEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  container.innerHTML = '';
  custCart.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <span class="cart-item__name">${escHtml(item.nama)}</span>
      <div class="cart-item__controls">
        <button type="button" class="cart-item__qty-btn" data-cid="${item.menuId}" data-delta="-1" aria-label="Kurangi">−</button>
        <span class="cart-item__qty">${item.jumlah}</span>
        <button type="button" class="cart-item__qty-btn" data-cid="${item.menuId}" data-delta="1" aria-label="Tambah">+</button>
      </div>
      <span class="cart-item__sub">${formatRupiah(item.harga * item.jumlah)}</span>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-cid]').forEach(btn => {
    btn.addEventListener('click', () => {
      custChangeQty(btn.dataset.cid, Number(btn.dataset.delta));
      renderCustMenuGrid();
    });
  });

  if (totalEl) totalEl.hidden = false;
  if (totalAmt) totalAmt.textContent = formatRupiah(custCartTotal());
  if (badgeEl) { badgeEl.textContent = custCartCount(); badgeEl.hidden = false; }
  if (submitBtn) submitBtn.disabled = false;
}

// ─── Customer: Buat Pesanan ───────────────────────────────────────────────────

function bindCustOrderForm() {
  const form = document.getElementById('custOrderForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('custOrderError');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

    const session = getActiveCustomer();
    if (!session) { showToast('Sesi habis, silakan login ulang.', 'error'); return; }
    if (custCart.length === 0) { showToast('Keranjang masih kosong.', 'error'); return; }

    const submitBtn = document.getElementById('custCreateOrderBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses…';

    try {
      // Re-verify harga & ketersediaan dari storage
      const verifiedItems = custCart.map(ci => {
        const m = getMenuById(ci.menuId);
        if (!m) throw new Error(`Menu "${ci.nama}" tidak lagi tersedia.`);
        if (!m.tersedia) throw new Error(`"${m.nama}" sudah habis. Hapus dari keranjang.`);
        return { menuId: m.id, nama: m.nama, harga: m.harga, jumlah: ci.jumlah };
      });

      const total = verifiedItems.reduce((s, i) => s + i.harga * i.jumlah, 0);
      const catatan = document.getElementById('custCatatan')?.value?.trim() || null;
      const nomorPesanan = generateNomorPesanan();
      const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';

      const order = {
        nomorPesanan,
        waktuMasuk: now,
        saluran: 'Self-Order',
        sumber: 'self-order',
        customerId: session.userId,
        namaPelanggan: session.nama,
        catatan,
        items: verifiedItems,
        total,
        statusPengerjaan: 'Menunggu',
        dibatalkan: false,
        alasanBatal: null, waktuBatal: null, dibatalkanOleh: null,
      };

      const payment = {
        id: 'pay_' + nomorPesanan,
        nomorPesanan,
        metode: 'QRIS',
        nominal: total,
        uangDiterima: null, kembalian: null,
        status: 'Menunggu Konfirmasi',
        waktuVerifikasi: null, dikonfirmasiOleh: null, referensi: null,
      };

      saveOrder(order);
      savePayment(payment);
      appendAuditLog({ nomorPesanan, aksi: 'PESANAN_DIBUAT', nilaiLama: null, nilaiBaru: 'Menunggu', aktor: session.nama });

      // Bersihkan keranjang & form
      custCart = [];
      renderCustCart();
      renderCustMenuGrid();
      form.reset();

      // Tampilkan konfirmasi via modal
      openModal('Pesanan Berhasil! 🎉', buildOrderConfirmBody(nomorPesanan, total, verifiedItems));
      showToast(`✅ Pesanan ${nomorPesanan} dikirim!`, 'success');

    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🧾 Pesan Sekarang';
    }
  });
}

function buildOrderConfirmBody(nomorPesanan, total, items) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
  wrap.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">✅</div>
      <div style="font-size:22px;font-weight:800;color:var(--color-primary);">${escHtml(nomorPesanan)}</div>
    </div>
    <div style="background:var(--color-surface-2);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;">
      ${items.map(i => `
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span>${i.jumlah}× ${escHtml(i.nama)}</span>
          <span style="font-weight:700;">${formatRupiah(i.harga * i.jumlah)}</span>
        </div>`).join('')}
      <div style="border-top:1px solid var(--color-border);padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;font-weight:800;">
        <span>Total</span>
        <span style="color:var(--color-primary);font-size:18px;">${formatRupiah(total)}</span>
      </div>
    </div>
    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:16px;text-align:center;">
      <div style="font-size:28px;margin-bottom:4px;">📲</div>
      <div style="font-weight:700;color:#92400E;margin-bottom:4px;">Bayar via QRIS</div>
      <div style="font-size:13px;color:#92400E;line-height:1.5;">
        Tunjukkan bukti transfer kepada kasir.<br>
        Pesanan diproses setelah pembayaran dikonfirmasi.
      </div>
    </div>
    <button type="button" class="btn btn--primary btn--full" id="goToMyOrdersBtn">
      📋 Lihat Status Pesanan
    </button>
  `;

  setTimeout(() => {
    document.getElementById('goToMyOrdersBtn')?.addEventListener('click', () => {
      closeModal();
      navigate('customer-status');
    });
  }, 50);

  return wrap;
}

// ─── Customer: Status Pesanan ─────────────────────────────────────────────────

const STATUS_STEPS = ['Menunggu', 'Diproses', 'Siap Diambil', 'Selesai'];

const STATUS_LABEL = {
  'Menunggu':     '⏳ Menunggu konfirmasi pembayaran',
  'Diproses':     '👨‍🍳 Sedang dimasak',
  'Siap Diambil': '🎉 Siap diambil!',
  'Selesai':      '✅ Selesai',
  'Dibatalkan':   '❌ Dibatalkan',
};

const STATUS_BANNER = {
  'Menunggu':     'status-banner--waiting',
  'Diproses':     'status-banner--process',
  'Siap Diambil': 'status-banner--ready',
  'Selesai':      'status-banner--done',
  'Dibatalkan':   'status-banner--cancelled',
};

function renderCustOrderStatus() {
  const container = document.getElementById('custOrderCards');
  if (!container) return;

  const session = getActiveCustomer();
  if (!session) return;

  const orders = getOrdersByCustomer(session.userId)
    .sort((a, b) => new Date(b.waktuMasuk) - new Date(a.waktuMasuk));

  container.innerHTML = '';

  if (orders.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state__icon">🛍️</span><p>Belum ada pesanan.<br>Yuk, pesan sekarang!</p></div>`;
    return;
  }

  orders.forEach(order => {
    const payment = getPaymentByNomor(order.nomorPesanan);
    const payStatus = payment ? payment.status : 'Belum Dibayar';
    const statusKey = order.dibatalkan ? 'Dibatalkan' : order.statusPengerjaan;
    const menit = Math.floor((Date.now() - new Date(order.waktuMasuk).getTime()) / 60000);

    const card = document.createElement('div');
    card.className = 'cust-order-card';
    card.innerHTML = `
      <div class="cust-order-card__header">
        <div>
          <div class="cust-order-card__nomor">${escHtml(order.nomorPesanan)}</div>
          <div class="cust-order-card__time">${formatWaktu(order.waktuMasuk)} · ${formatMenit(menit)} lalu</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <span class="badge ${payBadgeClass(payStatus)}">${payStatus}</span>
        </div>
      </div>

      <div class="cust-status-banner ${STATUS_BANNER[statusKey] || ''}">
        ${STATUS_LABEL[statusKey] || statusKey}
      </div>

      ${!order.dibatalkan ? buildProgressHTML(order.statusPengerjaan) : ''}

      <div class="cust-order-card__body">
        ${order.items.map(i => `
          <div style="display:flex;gap:8px;font-size:14px;padding:2px 0;">
            <span style="font-weight:700;color:var(--color-primary);min-width:24px;">${i.jumlah}×</span>
            <span>${escHtml(i.nama)}</span>
          </div>`).join('')}
        ${order.catatan ? `<div style="margin-top:6px;font-size:12px;color:var(--color-text-muted);font-style:italic;">📝 ${escHtml(order.catatan)}</div>` : ''}
      </div>

      <div class="cust-order-card__footer">
        ${order.dibatalkan ? `<span style="font-size:12px;color:var(--color-text-muted);">Alasan: ${escHtml(order.alasanBatal || '—')}</span>` : '<span></span>'}
        <span style="font-weight:700;color:var(--color-primary);">${formatRupiah(order.total)}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function buildProgressHTML(currentStatus) {
  const curIdx = STATUS_STEPS.indexOf(currentStatus);
  const shortLabel = { 'Menunggu': 'Menunggu', 'Diproses': 'Dimasak', 'Siap Diambil': 'Siap', 'Selesai': 'Selesai' };
  let html = '<div class="cust-progress">';
  STATUS_STEPS.forEach((step, idx) => {
    const done = idx < curIdx, active = idx === curIdx;
    if (idx > 0) html += `<div class="cust-progress__line${done ? ' cust-progress__line--done' : ''}"></div>`;
    html += `<div class="cust-progress__step">
      <div class="cust-progress__dot${done ? ' dot--done' : active ? ' dot--active' : ''}"></div>
      <div class="cust-progress__label${done ? ' label--done' : active ? ' label--active' : ''}">${shortLabel[step]}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function payBadgeClass(status) {
  return { 'Belum Dibayar': 'badge-pay--Belum', 'Menunggu Konfirmasi': 'badge-pay--Pending', 'Lunas': 'badge-pay--Lunas' }[status] || 'badge--gray';
}

// ─── Menu Manage Modals (owner) ───────────────────────────────────────────────

function openAddMenuModal() {
  const kategoriList = getKategoriList();
  const katOptions = kategoriList.map(k => `<option value="${escHtml(k)}">${escHtml(k)}</option>`).join('');
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
  body.innerHTML = `
    <div class="form-group">
      <label for="newMenuNama" class="form-label">Nama Menu <span style="color:var(--color-primary)">*</span></label>
      <input type="text" id="newMenuNama" class="form-input" maxlength="80" placeholder="Contoh: Spicy Burger" autocomplete="off" />
    </div>
    <div class="form-group">
      <label for="newMenuKategori" class="form-label">Kategori <span style="color:var(--color-primary)">*</span></label>
      <select id="newMenuKategori" class="form-input">${katOptions}<option value="__custom__">+ Kategori baru…</option></select>
      <input type="text" id="newMenuKategoriCustom" class="form-input mt-2" placeholder="Nama kategori baru" maxlength="50" style="display:none;" autocomplete="off" />
    </div>
    <div class="form-group">
      <label for="newMenuHarga" class="form-label">Harga (Rp) <span style="color:var(--color-primary)">*</span></label>
      <input type="number" id="newMenuHarga" class="form-input" inputmode="numeric" min="1000" step="500" placeholder="Contoh: 35000" />
    </div>
    <p class="form-error" id="addMenuError" hidden></p>
    <button type="button" class="btn btn--primary btn--full" id="saveNewMenuBtn">Simpan Menu</button>`;
  openModal('Tambah Menu Baru', body);
  setTimeout(() => {
    const katSel = document.getElementById('newMenuKategori');
    const katCustom = document.getElementById('newMenuKategoriCustom');
    katSel?.addEventListener('change', () => {
      katCustom.style.display = katSel.value === '__custom__' ? '' : 'none';
      if (katSel.value === '__custom__') katCustom.focus();
    });
    document.getElementById('saveNewMenuBtn')?.addEventListener('click', () => {
      const errorEl = document.getElementById('addMenuError');
      if (errorEl) { errorEl.hidden = true; }
      const nama = document.getElementById('newMenuNama')?.value || '';
      const harga = document.getElementById('newMenuHarga')?.value || '';
      const katVal = katSel?.value;
      const kategori = katVal === '__custom__' ? (katCustom?.value || '') : katVal;
      try {
        addMenuItem({ nama, kategori, harga: Number(harga) });
        closeModal();
        showToast(`Menu "${nama}" berhasil ditambahkan!`, 'success');
        renderMenuManage(openEditMenuModal, openAddMenuModal);
        renderMenuGrid();
      } catch (e) {
        if (errorEl) { errorEl.textContent = e.message; errorEl.hidden = false; }
      }
    });
    document.getElementById('newMenuNama')?.focus();
  }, 50);
}

function openEditMenuModal(item) {
  const kategoriList = getKategoriList();
  const katOptions = kategoriList.map(k => `<option value="${escHtml(k)}" ${k === item.kategori ? 'selected' : ''}>${escHtml(k)}</option>`).join('');
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
  body.innerHTML = `
    <div class="form-group">
      <label for="editMenuNama" class="form-label">Nama Menu</label>
      <input type="text" id="editMenuNama" class="form-input" value="${escHtml(item.nama)}" maxlength="80" autocomplete="off" />
    </div>
    <div class="form-group">
      <label for="editMenuKategori" class="form-label">Kategori</label>
      <select id="editMenuKategori" class="form-input">${katOptions}<option value="__custom__">+ Kategori baru…</option></select>
      <input type="text" id="editMenuKategoriCustom" class="form-input mt-2" placeholder="Nama kategori baru" maxlength="50" style="display:none;" autocomplete="off" />
    </div>
    <div class="form-group">
      <label for="editMenuHarga" class="form-label">Harga (Rp)</label>
      <input type="number" id="editMenuHarga" class="form-input" inputmode="numeric" value="${item.harga}" min="1000" step="500" />
    </div>
    <p class="form-error" id="editMenuError" hidden></p>
    <button type="button" class="btn btn--primary btn--full" id="saveEditMenuBtn">Simpan Perubahan</button>`;
  openModal(`Edit: ${item.nama}`, body);
  setTimeout(() => {
    const katSel = document.getElementById('editMenuKategori');
    const katCustom = document.getElementById('editMenuKategoriCustom');
    katSel?.addEventListener('change', () => {
      katCustom.style.display = katSel.value === '__custom__' ? '' : 'none';
      if (katSel.value === '__custom__') katCustom.focus();
    });
    document.getElementById('saveEditMenuBtn')?.addEventListener('click', () => {
      const errorEl = document.getElementById('editMenuError');
      if (errorEl) { errorEl.hidden = true; }
      const nama = document.getElementById('editMenuNama')?.value || '';
      const harga = document.getElementById('editMenuHarga')?.value || '';
      const katVal = katSel?.value;
      const kategori = katVal === '__custom__' ? (katCustom?.value || '') : katVal;
      try {
        editMenuItem(item.id, { nama, kategori, harga: Number(harga) });
        closeModal();
        showToast('Menu berhasil diperbarui!', 'success');
        renderMenuManage(openEditMenuModal, openAddMenuModal);
        renderMenuGrid();
      } catch (e) {
        if (errorEl) { errorEl.textContent = e.message; errorEl.hidden = false; }
      }
    });
  }, 50);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    await initStorage();
  } catch (err) {
    alert('Gagal menginisialisasi data: ' + err.message);
    return;
  }

  queueSetPayFn(renderPaymentList);
  paySetQueueFn(renderQueueBoard);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  bindModalClose();
  bindLogout();
  bindOrderForm();
  bindCustOrderForm();
  bindCategoryChips();

  // Owner: klik menu → cart kasir
  onMenuClick(item => { addToCart(item); renderCart(); });
  onCartChange(() => {});

  // Customer: chip kategori
  document.getElementById('custCategoryChips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-custcat]');
    if (!chip) return;
    document.querySelectorAll('[data-custcat]').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    custActiveCat = chip.dataset.custcat;
    renderCustMenuGrid();
  });

  // Customer: refresh status
  document.getElementById('refreshStatusBtn')?.addEventListener('click', () => {
    renderCustOrderStatus();
    showToast('Status diperbarui', 'success');
  });

  // Nav buttons
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });

  // Payment tabs
  bindPaymentTabs();

  // Menu manage button
  document.getElementById('addMenuBtn')?.addEventListener('click', openAddMenuModal);

  // Cek sesi aktif
  const ownerSession  = getActiveSession();
  const custSession   = getActiveCustomer();

  if (ownerSession) {
    onLoginSuccess('owner');
  } else if (custSession) {
    onLoginSuccess('customer');
  } else {
    showLoginPage();
  }
}

document.addEventListener('DOMContentLoaded', init);
