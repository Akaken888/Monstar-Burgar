/**
 * reports.js — Laporan & Riwayat (Tahap 1 minimal)
 * Monstar Burgers Order Manager
 */

import { getOrders, getPayments } from './storage.js';
import { formatRupiah, formatWaktu, toDateStr, todayStr, escHtml } from './utils.js';

let activeFilter = 'today'; // 'today' | 'all'

export function setReportFilter(filter) {
  activeFilter = filter;
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderReports() {
  renderSummary();
  renderTable();
  bindFilterButtons();
}

function renderSummary() {
  const el = document.getElementById('reportSummary');
  if (!el) return;

  const orders = getOrders();
  const payments = getPayments();
  const today = todayStr();

  const filtered = activeFilter === 'today'
    ? orders.filter(o => toDateStr(o.waktuMasuk) === today)
    : orders;

  const totalPesanan = filtered.length;
  const pesananAktif = filtered.filter(o => !o.dibatalkan).length;
  const dibatalkan = filtered.filter(o => o.dibatalkan).length;

  // Total penjualan lunas
  const lunasPay = payments.filter(p => {
    if (p.status !== 'Lunas') return false;
    if (activeFilter === 'today') {
      return toDateStr(p.waktuVerifikasi) === today;
    }
    return true;
  });
  const totalLunas = lunasPay.reduce((s, p) => s + (p.nominal || 0), 0);
  const totalTunai = lunasPay.filter(p => p.metode === 'Tunai').reduce((s, p) => s + p.nominal, 0);
  const totalQris  = lunasPay.filter(p => p.metode === 'QRIS').reduce((s, p) => s + p.nominal, 0);

  el.innerHTML = `
    <div class="summary-card">
      <div class="summary-card__label">Total Pesanan</div>
      <div class="summary-card__value">${totalPesanan}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Penjualan Lunas</div>
      <div class="summary-card__value">${formatRupiah(totalLunas)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Tunai</div>
      <div class="summary-card__value">${formatRupiah(totalTunai)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">QRIS</div>
      <div class="summary-card__value">${formatRupiah(totalQris)}</div>
    </div>
  `;
}

function renderTable() {
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;

  const orders = getOrders();
  const payments = getPayments();
  const today = todayStr();

  const filtered = activeFilter === 'today'
    ? orders.filter(o => toDateStr(o.waktuMasuk) === today)
    : orders;

  // Sort: terbaru dulu
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.waktuMasuk) - new Date(a.waktuMasuk)
  );

  tbody.innerHTML = '';

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">
      Tidak ada transaksi ${activeFilter === 'today' ? 'hari ini' : ''}.
    </td></tr>`;
    return;
  }

  sorted.forEach(order => {
    const pay = payments.find(p => p.nomorPesanan === order.nomorPesanan);
    const payStatus = pay ? pay.status : '—';
    const metode = pay ? pay.metode : '—';

    const tr = document.createElement('tr');
    if (order.dibatalkan) tr.classList.add('cancelled');

    tr.innerHTML = `
      <td><strong>${escHtml(order.nomorPesanan)}</strong>${order.dibatalkan ? '<br><span style="font-size:11px;color:#EF4444;text-decoration:none;">Dibatalkan</span>' : ''}</td>
      <td style="white-space:nowrap;font-size:13px;">${formatWaktu(order.waktuMasuk)}</td>
      <td>${order.namaPelanggan ? escHtml(order.namaPelanggan) : '<span style="color:var(--color-text-muted)">—</span>'}</td>
      <td style="font-weight:700;color:var(--color-primary);">${formatRupiah(order.total)}</td>
      <td><span class="badge badge--gray">${escHtml(metode)}</span></td>
      <td><span class="badge ${statusBadgeClass(order.dibatalkan ? 'Dibatalkan' : order.statusPengerjaan)}">${order.dibatalkan ? 'Dibatalkan' : escHtml(order.statusPengerjaan)}</span></td>
      <td><span class="badge ${payBadgeClass(payStatus)}">${escHtml(payStatus)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function bindFilterButtons() {
  const todayBtn = document.getElementById('filterToday');
  const allBtn = document.getElementById('filterAll');

  if (todayBtn) {
    todayBtn.onclick = () => {
      activeFilter = 'today';
      todayBtn.classList.add('chip--active');
      allBtn?.classList.remove('chip--active');
      renderSummary();
      renderTable();
    };
  }
  if (allBtn) {
    allBtn.onclick = () => {
      activeFilter = 'all';
      allBtn.classList.add('chip--active');
      todayBtn?.classList.remove('chip--active');
      renderSummary();
      renderTable();
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeClass(status) {
  const map = {
    'Menunggu':    'badge-status--Menunggu',
    'Diproses':    'badge-status--Diproses',
    'Siap Diambil':'badge-status--Siap',
    'Selesai':     'badge-status--Selesai',
    'Dibatalkan':  'badge--gray',
  };
  return map[status] || 'badge--gray';
}

function payBadgeClass(status) {
  const map = {
    'Belum Dibayar':        'badge-pay--Belum',
    'Menunggu Konfirmasi':  'badge-pay--Pending',
    'Lunas':                'badge-pay--Lunas',
  };
  return map[status] || 'badge--gray';
}
