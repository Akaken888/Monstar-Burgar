/**
 * payments.js — Manajemen Pembayaran (PayMatch)
 * Monstar Burgers Order Manager
 */

import {
  getPayments, getPaymentByNomor, updatePaymentStatus,
  getOrderByNomor, getCustomerById, appendAuditLog,
} from './storage.js';
import { getActiveName } from './auth.js';
import { formatRupiah, formatWaktu } from './utils.js';
import { showToast, openModal, closeModal } from './ui.js';
// queue.js diimport secara lazy untuk menghindari circular dependency
let _renderQueueBoard = null;
export function setRenderQueueBoard(fn) { _renderQueueBoard = fn; }
function renderQueueBoard() { if (_renderQueueBoard) _renderQueueBoard(); }

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Konfirmasi pembayaran Tunai.
 */
export function confirmCash(nomorPesanan, uangDiterima) {
  const payment = getPaymentByNomor(nomorPesanan);
  if (!payment) throw new Error('Data pembayaran tidak ditemukan.');
  if (payment.status === 'Lunas') throw new Error('Pembayaran sudah Lunas.');

  const nominal = Number(uangDiterima);
  if (isNaN(nominal) || nominal <= 0) throw new Error('Masukkan nominal uang yang valid.');
  if (nominal < payment.nominal) {
    throw new Error(`Uang diterima (${formatRupiah(nominal)}) kurang dari total (${formatRupiah(payment.nominal)}).`);
  }

  const kembalian = nominal - payment.nominal;
  const aktor = getActiveName();

  updatePaymentStatus(nomorPesanan, 'Lunas', {
    uangDiterima: nominal,
    kembalian,
    waktuVerifikasi: nowJakarta(),
    dikonfirmasiOleh: aktor,
  });

  appendAuditLog({
    nomorPesanan,
    aksi: 'PEMBAYARAN_DIKONFIRMASI',
    nilaiLama: payment.status,
    nilaiBaru: 'Lunas',
    aktor,
  });

  return { kembalian };
}

/**
 * Konfirmasi pembayaran QRIS.
 * @param {string} referensi — opsional
 */
export function confirmQRIS(nomorPesanan, referensi) {
  const payment = getPaymentByNomor(nomorPesanan);
  if (!payment) throw new Error('Data pembayaran tidak ditemukan.');
  if (payment.status === 'Lunas') throw new Error('Pembayaran sudah Lunas.');

  const aktor = getActiveName();

  updatePaymentStatus(nomorPesanan, 'Lunas', {
    referensi: referensi?.trim() || null,
    waktuVerifikasi: nowJakarta(),
    dikonfirmasiOleh: aktor,
  });

  appendAuditLog({
    nomorPesanan,
    aksi: 'PEMBAYARAN_DIKONFIRMASI',
    nilaiLama: payment.status,
    nilaiBaru: 'Lunas',
    aktor,
  });
}

// ─── Render: Daftar Pembayaran ────────────────────────────────────────────────

let activePayTab = 'unpaid';

export function setActivePayTab(tab) { activePayTab = tab; }

export function renderPaymentList() {
  const list = document.getElementById('paymentList');
  const unpaidCountEl = document.getElementById('unpaidCount');
  if (!list) return;

  const payments = getPayments();
  const unpaid = payments.filter(p => p.status !== 'Lunas');

  if (unpaidCountEl) {
    unpaidCountEl.textContent = unpaid.length > 0 ? String(unpaid.length) : '';
    unpaidCountEl.style.display = unpaid.length > 0 ? '' : 'none';
  }

  const toShow = activePayTab === 'unpaid' ? unpaid : payments;
  list.innerHTML = '';

  if (toShow.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">${activePayTab === 'unpaid' ? '✅' : '📭'}</span>
        <p>${activePayTab === 'unpaid' ? 'Semua pesanan sudah lunas!' : 'Belum ada transaksi.'}</p>
      </div>`;
    return;
  }

  // Sort: belum lunas dulu, lalu waktuMasuk terbaru
  const sorted = [...toShow].sort((a, b) => {
    const order = getOrderByNomor(a.nomorPesanan);
    const orderB = getOrderByNomor(b.nomorPesanan);
    if (!order || !orderB) return 0;
    return new Date(orderB.waktuMasuk) - new Date(order.waktuMasuk);
  });

  sorted.forEach(pay => {
    const order = getOrderByNomor(pay.nomorPesanan);
    if (!order) return;

    const item = document.createElement('div');
    item.className = 'payment-item';
    item.innerHTML = `
      <div class="payment-item__info">
        <div class="payment-item__nomor">${escHtml(pay.nomorPesanan)}</div>
        <div class="payment-item__meta">
          ${getOrderDisplayName(order)} · ${formatWaktu(order.waktuMasuk)}
        </div>
        <div style="margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
          <span class="badge ${payBadgeClass(pay.status)}">${pay.status}</span>
          <span class="badge badge--gray">${pay.metode}</span>
          ${pay.dikonfirmasiOleh ? `<span style="font-size:12px;color:var(--color-text-muted);">✓ ${escHtml(pay.dikonfirmasiOleh)} · ${formatWaktu(pay.waktuVerifikasi)}</span>` : ''}
        </div>
      </div>
      <div class="payment-item__actions">
        <span class="payment-item__total">${formatRupiah(pay.nominal)}</span>
        ${pay.status !== 'Lunas' ? `<button type="button" class="btn btn--primary btn--sm" data-pay-nomor="${escHtml(pay.nomorPesanan)}">Proses Bayar</button>` : ''}
      </div>
    `;

    list.appendChild(item);
  });

  // Bind "Proses Bayar" buttons
  list.querySelectorAll('[data-pay-nomor]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nomor = btn.dataset.payNomor;
      openPayModal(nomor);
    });
  });
}

// ─── Modal Pembayaran ─────────────────────────────────────────────────────────

function openPayModal(nomorPesanan) {
  const payment = getPaymentByNomor(nomorPesanan);
  const order = getOrderByNomor(nomorPesanan);
  if (!payment || !order) return;

  const title = `Bayar ${nomorPesanan}`;
  const body = payment.metode === 'Tunai'
    ? buildCashForm(payment, order)
    : buildQrisForm(payment, order);

  openModal(title, body);
}

// — Tunai form
function buildCashForm(payment, order) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '16px';

  wrap.innerHTML = `
    <div class="pay-modal-info">
      <div class="pay-modal-info__row">
        <span class="pay-modal-info__label">Pelanggan</span>
        <span class="pay-modal-info__val">${order.namaPelanggan ? escHtml(order.namaPelanggan) : '—'}</span>
      </div>
      <div class="pay-modal-info__row">
        <span class="pay-modal-info__label">Item</span>
        <span class="pay-modal-info__val">${order.items.map(i => `${i.jumlah}× ${escHtml(i.nama)}`).join(', ')}</span>
      </div>
      <div class="pay-modal-info__row pay-modal-info__total">
        <span class="pay-modal-info__label">Total</span>
        <span class="pay-modal-info__val">${formatRupiah(payment.nominal)}</span>
      </div>
    </div>

    <div class="form-group">
      <label for="cashInput" class="form-label">Uang Diterima (Rp)</label>
      <input type="number" id="cashInput" class="form-input"
        inputmode="numeric" min="${payment.nominal}" step="1000"
        placeholder="${payment.nominal}" aria-describedby="kembalianRow" />
    </div>

    <div class="kembalian-row" id="kembalianRow">
      <span>Kembalian</span>
      <span id="kembalianAmt">—</span>
    </div>

    <p class="form-error" id="cashError" hidden></p>

    <button type="button" class="btn btn--primary btn--full btn--lg" id="confirmCashBtn">
      💵 Konfirmasi Lunas
    </button>
  `;

  setTimeout(() => {
    const input = document.getElementById('cashInput');
    const kembalianAmt = document.getElementById('kembalianAmt');
    const kembalianRow = document.getElementById('kembalianRow');
    const confirmBtn = document.getElementById('confirmCashBtn');
    const errorEl = document.getElementById('cashError');

    if (input) {
      input.addEventListener('input', () => {
        const val = Number(input.value);
        const diff = val - payment.nominal;
        if (kembalianAmt) {
          kembalianAmt.textContent = val > 0 ? formatRupiah(Math.max(0, diff)) : '—';
        }
        if (kembalianRow) {
          kembalianRow.className = diff >= 0 ? 'kembalian-row' : 'kembalian-row kembalian-row--negative';
        }
      });
      input.focus();
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
        try {
          const result = confirmCash(payment.nomorPesanan, Number(input?.value));
          closeModal();
          showToast(`✅ Lunas! Kembalian ${formatRupiah(result.kembalian)}`, 'success');
          renderPaymentList();
          renderQueueBoard();
        } catch (e) {
          if (errorEl) { errorEl.textContent = e.message; errorEl.hidden = false; }
        }
      });
    }
  }, 50);

  return wrap;
}

// — QRIS form
function buildQrisForm(payment, order) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '16px';

  wrap.innerHTML = `
    <div class="qris-warning">
      <span class="qris-warning__icon" aria-hidden="true">⚠️</span>
      <span class="qris-warning__text">
        Tangkapan layar dari pelanggan <strong>bukan bukti pembayaran yang sah</strong>.
        Selalu cek riwayat transaksi di aplikasi bank/QRIS Anda.
      </span>
    </div>

    <div class="pay-modal-info">
      <div class="pay-modal-info__row">
        <span class="pay-modal-info__label">Pelanggan</span>
        <span class="pay-modal-info__val">${order.namaPelanggan ? escHtml(order.namaPelanggan) : '—'}</span>
      </div>
      <div class="pay-modal-info__row pay-modal-info__total">
        <span class="pay-modal-info__label">Total</span>
        <span class="pay-modal-info__val">${formatRupiah(payment.nominal)}</span>
      </div>
    </div>

    <div class="form-group">
      <label for="qrisRef" class="form-label">Referensi Transaksi <span class="form-hint">(opsional, 4 digit terakhir ID)</span></label>
      <input type="text" id="qrisRef" class="form-input"
        maxlength="20" placeholder="Contoh: 4821" inputmode="numeric" />
    </div>

    <label class="checkbox-label" for="qrisCheck">
      <input type="checkbox" id="qrisCheck" />
      <span>Saya sudah mengecek riwayat transaksi di aplikasi bank/QRIS saya dan pembayaran telah masuk.</span>
    </label>

    <p class="form-error" id="qrisError" hidden></p>

    <button type="button" class="btn btn--primary btn--full btn--lg" id="confirmQrisBtn" disabled>
      📲 Konfirmasi Lunas
    </button>
  `;

  setTimeout(() => {
    const checkbox = document.getElementById('qrisCheck');
    const confirmBtn = document.getElementById('confirmQrisBtn');
    const refInput = document.getElementById('qrisRef');
    const errorEl = document.getElementById('qrisError');

    if (checkbox && confirmBtn) {
      checkbox.addEventListener('change', () => {
        confirmBtn.disabled = !checkbox.checked;
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (!checkbox?.checked) return;
        if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
        try {
          confirmQRIS(payment.nomorPesanan, refInput?.value || '');
          closeModal();
          showToast('✅ Pembayaran QRIS dikonfirmasi!', 'success');
          renderPaymentList();
          renderQueueBoard();
        } catch (e) {
          if (errorEl) { errorEl.textContent = e.message; errorEl.hidden = false; }
        }
      });
    }
  }, 50);

  return wrap;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function payBadgeClass(status) {
  const map = {
    'Belum Dibayar':        'badge-pay--Belum',
    'Menunggu Konfirmasi':  'badge-pay--Pending',
    'Lunas':                'badge-pay--Lunas',
  };
  return map[status] || 'badge--gray';
}

function getOrderDisplayName(order) {
  if (order.sumber === 'self-order' && order.customerId) {
    const customer = getCustomerById(order.customerId);
    const nama = customer ? customer.nama : (order.namaPelanggan || 'Pelanggan');
    return `📱 ${escHtml(nama)}`;
  }
  return order.namaPelanggan ? `👤 ${escHtml(order.namaPelanggan)}` : '';
}

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

export function bindPaymentTabs() {
  const tabBtns = document.querySelectorAll('[data-tab]');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('tab--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('tab--active');
      btn.setAttribute('aria-selected', 'true');
      setActivePayTab(btn.dataset.tab);
      renderPaymentList();
    });
  });
}
