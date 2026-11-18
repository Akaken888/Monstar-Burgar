/**
 * menu.js — Logika pengelolaan menu
 * Monstar Burgers Order Manager
 */

import {
  getMenu, getMenuById, saveMenuItem, updateMenuItem,
  appendAuditLog
} from './storage.js';
import { getActiveName } from './auth.js';
import { formatRupiah } from './utils.js';

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Kembalikan menu dikelompokkan per kategori.
 * @returns {{ [kategori: string]: object[] }}
 */
export function getMenuGrouped() {
  const menu = getMenu();
  const groups = {};
  menu.forEach(item => {
    if (!groups[item.kategori]) groups[item.kategori] = [];
    groups[item.kategori].push(item);
  });
  return groups;
}

/** Daftar kategori unik dari menu. */
export function getKategoriList() {
  const menu = getMenu();
  const set = new Set(menu.map(m => m.kategori));
  return Array.from(set);
}

/** Tambah item menu baru. */
export function addMenuItem(data) {
  if (!data.nama || !data.nama.trim()) throw new Error('Nama menu tidak boleh kosong.');
  const harga = Number(data.harga);
  if (!harga || harga <= 0) throw new Error('Harga menu harus lebih dari 0.');
  if (!data.kategori || !data.kategori.trim()) throw new Error('Kategori tidak boleh kosong.');

  const item = saveMenuItem({
    nama: data.nama.trim(),
    kategori: data.kategori.trim(),
    harga,
    tersedia: true,
  });

  appendAuditLog({
    nomorPesanan: null,
    aksi: 'MENU_DITAMBAH',
    nilaiLama: null,
    nilaiBaru: item.nama,
    aktor: getActiveName(),
  });

  return item;
}

/** Edit item menu yang ada. */
export function editMenuItem(id, data) {
  if (!data.nama || !data.nama.trim()) throw new Error('Nama menu tidak boleh kosong.');
  const harga = Number(data.harga);
  if (!harga || harga <= 0) throw new Error('Harga menu harus lebih dari 0.');
  if (!data.kategori || !data.kategori.trim()) throw new Error('Kategori tidak boleh kosong.');

  const item = updateMenuItem(id, {
    nama: data.nama.trim(),
    kategori: data.kategori.trim(),
    harga,
  });

  appendAuditLog({
    nomorPesanan: null,
    aksi: 'MENU_DIEDIT',
    nilaiLama: null,
    nilaiBaru: item.nama,
    aktor: getActiveName(),
  });

  return item;
}

/** Toggle ketersediaan menu (habis ↔ tersedia). */
export function toggleKetersediaan(id) {
  const item = getMenuById(id);
  if (!item) throw new Error('Menu tidak ditemukan.');

  const newVal = !item.tersedia;
  updateMenuItem(id, { tersedia: newVal });

  appendAuditLog({
    nomorPesanan: null,
    aksi: 'MENU_KETERSEDIAAN_BERUBAH',
    nilaiLama: item.tersedia ? 'Tersedia' : 'Habis',
    nilaiBaru: newVal ? 'Tersedia' : 'Habis',
    aktor: getActiveName(),
  });

  return newVal;
}

// ─── Render: Grid Menu (Kasir) ────────────────────────────────────────────────

let activeCategory = 'Semua';
let onMenuClickCallback = null;

/** Daftarkan callback yang dipanggil saat menu diklik (untuk kasir). */
export function onMenuClick(cb) { onMenuClickCallback = cb; }

/** Render ulang grid menu di halaman kasir. */
export function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  const menu = getMenu();
  const filtered = activeCategory === 'Semua'
    ? menu
    : menu.filter(m => m.kategori === activeCategory);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><span class="empty-state__icon">🍽️</span><p>Tidak ada menu di kategori ini.</p></div>';
    return;
  }

  filtered.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.disabled = !item.tersedia;
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', `${item.nama}, ${formatRupiah(item.harga)}${!item.tersedia ? ', habis' : ''}`);
    btn.dataset.menuId = item.id;

    btn.innerHTML = `
      <span class="menu-btn__name">${escHtml(item.nama)}</span>
      <span class="menu-btn__price">${formatRupiah(item.harga)}</span>
      ${!item.tersedia ? '<span class="menu-btn__badge">Habis</span>' : ''}
    `;

    if (item.tersedia) {
      btn.addEventListener('click', () => {
        if (onMenuClickCallback) onMenuClickCallback(item);
      });
    }

    grid.appendChild(btn);
  });
}

/** Bind chip kategori di halaman kasir. */
export function bindCategoryChips() {
  const container = document.getElementById('categoryChips');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;

    activeCategory = chip.dataset.cat;
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    renderMenuGrid();
  });
}

// ─── Render: Kelola Menu ──────────────────────────────────────────────────────

/** Render daftar menu di halaman kelola menu. */
export function renderMenuManage(openEditModal, openAddModal) {
  const list = document.getElementById('menuManageList');
  if (!list) return;

  const menu = getMenu();

  if (menu.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-state__icon">🍽️</span><p>Belum ada item menu.</p></div>';
    return;
  }

  // Group by category
  const groups = getMenuGrouped();
  list.innerHTML = '';

  Object.entries(groups).forEach(([kat, items]) => {
    const header = document.createElement('div');
    header.style.cssText = 'padding: 8px 0 4px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: var(--color-text-muted);';
    header.textContent = kat;
    list.appendChild(header);

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'menu-manage-item';
      el.dataset.menuId = item.id;
      el.innerHTML = `
        <div class="menu-manage-item__info">
          <div class="menu-manage-item__name">${escHtml(item.nama)}</div>
          <div class="menu-manage-item__meta">${escHtml(item.kategori)}</div>
        </div>
        <div class="menu-manage-item__price">${formatRupiah(item.harga)}</div>
        <div class="menu-manage-item__actions">
          <label class="toggle-wrap" title="${item.tersedia ? 'Tandai Habis' : 'Tandai Tersedia'}">
            <span class="toggle-switch">
              <input type="checkbox" ${item.tersedia ? 'checked' : ''}
                aria-label="Ketersediaan ${escHtml(item.nama)}"
                data-toggle-id="${item.id}" />
              <span class="toggle-switch__track"></span>
            </span>
            <span class="toggle-label">${item.tersedia ? 'Tersedia' : 'Habis'}</span>
          </label>
          <button type="button" class="btn btn--outline btn--sm" data-edit-id="${item.id}"
            aria-label="Edit ${escHtml(item.nama)}">
            Edit
          </button>
        </div>
      `;
      list.appendChild(el);
    });
  });

  // Bind toggle events
  list.querySelectorAll('[data-toggle-id]').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.toggleId;
      try {
        toggleKetersediaan(id);
        renderMenuManage(openEditModal, openAddModal);
        renderMenuGrid(); // update kasir juga
      } catch (e) {
        alert(e.message);
      }
    });
  });

  // Bind edit buttons
  list.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editId;
      const item = getMenuById(id);
      if (item) openEditModal(item);
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
