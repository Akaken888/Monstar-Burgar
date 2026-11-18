/**
 * queue.js — Papan Antrean
 * Monstar Burgers Order Manager
 */

import { getOrders, getPaymentByNomor } from './storage.js';
import { advanceOrderStatus, getNextStatusLabel, cancelOrder } from './orders.js';
import { formatRupiah, formatMenit } from './utils.js';
import { showToast, openModal, closeModal } from './ui.js';
// payments.js diimport secara lazy untuk menghindari circular dependency
let _renderPaymentList = null;
export function setRenderPaymentList(fn) { _renderPaymentList = fn; }
function renderPaymentList() { if (_renderPaymentList) _renderPaymentList(); }

const URGENT_MINUTES = 15;
let queueInterval = null;

// ─── Main Render ──────────────────────────────────────────────────────────────

export function renderQueueBoard() {
  const board = document.getElementById('queueBoard');
  const countEl = document.getElementById('queueCount');
  if (!board) return;

  const all = getOrders();
  // Aktif = belum dibatalkan & belum Selesai
  const active = all
    .filter(o => !o.dibatalkan && o.statusPengerjaan !== 'Selesai')
    .sort((a, b) => new Date(a.waktuMasuk) - new Date(b.waktuMasuk)); // FIFO

  if (countEl) {
    countEl.textContent = active.length > 0 ? `${active.length} pesanan aktif` : '';
  }

  board.innerHTML = '';

  if (active.length === 0) {
    board.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">🎉</span>
        <p>Belum ada pesanan aktif.<br>Silakan buat pesanan baru.</p>
      </div>`;
    return;
  }

  active.forEach(order => {
    const card = buildQueueCard(order);
    board.appendChild(card);
  });
}

// ─── Build Card ───────────────────────────────────────────────────────────────

function buildQueueCard(order) {
  const payment = getPaymentByNomor(order.nomorPesanan);
  const payStatus = payment ? payment.status : 'Belum Dibayar';
  const menit = getWaitMinutes(order.waktuMasuk);
  const isUrgent = menit >= URGENT_MINUTES;

  const card = document.createElement('div');
  card.className = `queue-card${isUrgent ? ' queue-card--urgent' : ''}`;
  card.dataset.nomor = order.nomorPesanan;

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'queue-card__header';
  headerDiv.innerHTML = `
    <span class="queue-card__nomor">${escHtml(order.nomorPesanan)}</span>
    <div class="queue-card__meta">
      ${order.sumber === 'self-order' ? '<span class="badge badge--selforder">📱 Self-Order</span>' : ''}
      ${isUrgent ? '<span class="queue-card__urgent-badge">⚠ Lama</span>' : ''}
      <span class="queue-card__time">⏱ ${formatMenit(menit)}</span>
      <span class="badge ${payBadgeClass(payStatus)}">${payLabelDisplay(payStatus)}</span>
      <span class="badge ${statusBadgeClass(order.statusPengerjaan)}">${order.statusPengerjaan}</span>
    </div>
  `;
  card.appendChild(headerDiv);

  // Body
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'queue-card__body';

  if (order.namaPelanggan) {
    bodyDiv.innerHTML += `<div class="queue-card__customer">👤 ${escHtml(order.namaPelanggan)}</div>`;
  }

  const itemsDiv = document.createElement('div');
  itemsDiv.className = 'queue-card__items';
  order.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'queue-card__item';
    row.innerHTML = `<span class="queue-card__item-qty">${item.jumlah}×</span><span>${escHtml(item.nama)}</span>`;
    itemsDiv.appendChild(row);
  });
  bodyDiv.appendChild(itemsDiv);

  if (order.catatan) {
    bodyDiv.innerHTML += `<div class="queue-card__catatan">📝 ${escHtml(order.catatan)}</div>`;
  }
  card.appendChild(bodyDiv);

  // Warning jika belum lunas & mau diproses
  const needsPayWarn = payStatus !== 'Lunas' && order.statusPengerjaan === 'Menunggu';
  if (needsPayWarn) {
    const warn = document.createElement('div');
    warn.className = 'queue-card__warn';
    warn.innerHTML = `<span>🔒</span><span>Konfirmasi pembayaran dulu sebelum mulai proses.</span>`;
    card.appendChild(warn);
  }

  // Footer
  const footerDiv = document.createElement('div');
  footerDiv.className = 'queue-card__footer';

  // Total
  const totalSpan = document.createElement('span');
  totalSpan.style.cssText = 'font-weight: 700; color: var(--color-primary);';
  totalSpan.textContent = formatRupiah(order.total);
  footerDiv.appendChild(totalSpan);

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'queue-card__actions';

  const nextLabel = getNextStatusLabel(order.statusPengerjaan);
  if (nextLabel) {
    const advBtn = document.createElement('button');
    advBtn.type = 'button';
    advBtn.className = 'btn btn--primary btn--sm';
    advBtn.textContent = nextLabel;
    advBtn.addEventListener('click', () => handleAdvance(order.nomorPesanan));
    actionsDiv.appendChild(advBtn);
  }

  // Batalkan — hanya untuk Menunggu / Diproses
  if (['Menunggu', 'Diproses'].includes(order.statusPengerjaan)) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn--ghost btn--sm';
    cancelBtn.style.color = '#EF4444';
    cancelBtn.textContent = 'Batalkan';
    cancelBtn.addEventListener('click', () => handleCancel(order.nomorPesanan));
    actionsDiv.appendChild(cancelBtn);
  }

  footerDiv.appendChild(actionsDiv);
  card.appendChild(footerDiv);

  return card;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleAdvance(nomorPesanan) {
  try {
    const newStatus = advanceOrderStatus(nomorPesanan);
    showToast(`Pesanan ${nomorPesanan} → ${newStatus}`, 'success');
    renderQueueBoard();
    renderPaymentList(); // sync bayar
  } catch (e) {
    if (e.message === 'PAYMENT_REQUIRED') {
      showToast('⚠ Konfirmasi pembayaran dulu sebelum memproses pesanan!', 'error');
    } else {
      showToast(e.message, 'error');
    }
  }
}

function handleCancel(nomorPesanan) {
  openModal('Batalkan Pesanan', buildCancelForm(nomorPesanan));
}

function buildCancelForm(nomorPesanan) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '16px';

  wrap.innerHTML = `
    <p style="color: var(--color-text-muted); font-size: 14px;">
      Pesanan <strong>${escHtml(nomorPesanan)}</strong> akan dibatalkan. Tindakan ini tidak dapat diurungkan.
    </p>
    <div class="form-group">
      <label for="cancelReason" class="form-label">Alasan Pembatalan <span style="color: var(--color-primary);">*</span></label>
      <textarea id="cancelReason" class="form-input form-input--textarea" rows="3"
        placeholder="Contoh: pelanggan mengubah pikiran, stok habis mendadak…" maxlength="200"></textarea>
      <p class="form-error" id="cancelError" hidden></p>
    </div>
    <button type="button" class="btn btn--danger btn--full" id="confirmCancelBtn">
      Batalkan Pesanan
    </button>
  `;

  // Delay binding (modal DOM belum ada saat ini dipanggil)
  setTimeout(() => {
    const btn = document.getElementById('confirmCancelBtn');
    if (btn) btn.addEventListener('click', () => {
      const alasan = document.getElementById('cancelReason')?.value || '';
      const errorEl = document.getElementById('cancelError');
      try {
        cancelOrder(nomorPesanan, alasan);
        closeModal();
        showToast(`Pesanan ${nomorPesanan} dibatalkan.`, 'warning');
        renderQueueBoard();
        renderPaymentList();
      } catch (e) {
        if (errorEl) { errorEl.textContent = e.message; errorEl.hidden = false; }
      }
    });
  }, 50);

  return wrap;
}

// ─── Auto-refresh Timer ───────────────────────────────────────────────────────

export function startQueueTimer() {
  if (queueInterval) clearInterval(queueInterval);
  queueInterval = setInterval(() => {
    const board = document.getElementById('queueBoard');
    if (board && board.closest('.page.active')) {
      renderQueueBoard();
    }
  }, 60_000);
}

export function stopQueueTimer() {
  if (queueInterval) clearInterval(queueInterval);
  queueInterval = null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWaitMinutes(waktuMasuk) {
  const diff = Date.now() - new Date(waktuMasuk).getTime();
  return Math.floor(diff / 60_000);
}

function payBadgeClass(status) {
  const map = {
    'Belum Dibayar':        'badge-pay--Belum',
    'Menunggu Konfirmasi':  'badge-pay--Pending',
    'Lunas':                'badge-pay--Lunas',
  };
  return map[status] || 'badge--gray';
}

function payLabelDisplay(status) {
  if (status === 'Menunggu Konfirmasi') return 'Menunggu QRIS';
  return status;
}

function statusBadgeClass(status) {
  const map = {
    'Menunggu':    'badge-status--Menunggu',
    'Diproses':    'badge-status--Diproses',
    'Siap Diambil':'badge-status--Siap',
    'Selesai':     'badge-status--Selesai',
  };
  return map[status] || 'badge--gray';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
