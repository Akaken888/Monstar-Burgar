/**
 * storage.js — Data Access Layer (DAL)
 * Monstar Burgers Order Manager
 *
 * Satu-satunya modul yang membaca/menulis localStorage.
 * Modul lain TIDAK BOLEH mengakses localStorage langsung.
 */

// ─── Storage Keys ───────────────────────────────────────────────────────────
const KEYS = {
  MENU: 'mb_menu',
  ORDERS: 'mb_orders',
  PAYMENTS: 'mb_payments',
  USERS: 'mb_users',
  AUDIT_LOG: 'mb_audit_log',
  COUNTERS: 'mb_counters',
};

// sessionStorage key
const SESSION_KEY = 'mb_session';

// ─── Seed Data ───────────────────────────────────────────────────────────────

/**
 * Hash PIN menggunakan SHA-256 via SubtleCrypto.
 * Dipakai saat seed user dan saat login.
 */
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(pin));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SEED_MENU = [
  { id: 'menu_001', nama: 'Wimpy', kategori: 'Burger & Sandwich', harga: 32000, tersedia: true },
  { id: 'menu_002', nama: 'Cheese Burger', kategori: 'Burger & Sandwich', harga: 37000, tersedia: true },
  { id: 'menu_003', nama: 'Double Cheese Burger', kategori: 'Burger & Sandwich', harga: 47000, tersedia: true },
  { id: 'menu_004', nama: 'Eggy', kategori: 'Burger & Sandwich', harga: 37000, tersedia: true },
  { id: 'menu_005', nama: 'Classic Chicken Sandwich', kategori: 'Burger & Sandwich', harga: 32000, tersedia: true },
  { id: 'menu_006', nama: 'Nashville Chicken Sandwich', kategori: 'Burger & Sandwich', harga: 37000, tersedia: true },
  { id: 'menu_007', nama: 'Fries OG', kategori: 'Kentang Goreng', harga: 17000, tersedia: true },
  { id: 'menu_008', nama: 'Cheese Fries', kategori: 'Kentang Goreng', harga: 21000, tersedia: true },
  { id: 'menu_009', nama: 'Beef & Cheese Fries', kategori: 'Kentang Goreng', harga: 31000, tersedia: true },
  { id: 'menu_010', nama: 'Chicken Fries', kategori: 'Kentang Goreng', harga: 28000, tersedia: true },
];

// PIN default: Suami = "1234", Istri = "5678"
// Hash dihitung saat initStorage() dipanggil pertama kali (async)
let SEED_USERS_TEMPLATE = [
  { id: 'user_suami', nama: 'Suami', peran: 'owner', defaultPin: '1234' },
  { id: 'user_istri', nama: 'Istri', peran: 'owner', defaultPin: '5678' },
];

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Inisialisasi storage: seed data jika belum ada.
 * Harus dipanggil sekali saat app dimulai (await initStorage()).
 */
export async function initStorage() {
  // Seed menu
  if (!localStorage.getItem(KEYS.MENU)) {
    localStorage.setItem(KEYS.MENU, JSON.stringify(SEED_MENU));
  }

  // Seed users (hash PIN)
  if (!localStorage.getItem(KEYS.USERS)) {
    const users = await Promise.all(
      SEED_USERS_TEMPLATE.map(async (u) => ({
        id: u.id,
        nama: u.nama,
        peran: u.peran,
        pinHash: await hashPin(u.defaultPin),
      }))
    );
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  }

  // Init empty arrays jika belum ada
  if (!localStorage.getItem(KEYS.ORDERS)) {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.PAYMENTS)) {
    localStorage.setItem(KEYS.PAYMENTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.AUDIT_LOG)) {
    localStorage.setItem(KEYS.AUDIT_LOG, JSON.stringify([]));
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`[storage] Gagal membaca ${key}:`, e);
    throw new Error(`Gagal membaca data (${key}). Coba refresh halaman.`);
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[storage] Gagal menyimpan ${key}:`, e);
    if (e.name === 'QuotaExceededError') {
      throw new Error('Penyimpanan penuh. Hapus data lama atau bersihkan cache browser.');
    }
    throw new Error(`Gagal menyimpan data (${key}).`);
  }
}

function nowJakarta() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── MENU ─────────────────────────────────────────────────────────────────────

export function getMenu() {
  return readJSON(KEYS.MENU) || [];
}

export function getMenuById(id) {
  return getMenu().find(m => m.id === id) || null;
}

export function saveMenuItem(item) {
  const menu = getMenu();
  const newItem = {
    id: item.id || 'menu_' + uid(),
    nama: item.nama,
    kategori: item.kategori,
    harga: item.harga,
    tersedia: item.tersedia !== undefined ? item.tersedia : true,
  };
  menu.push(newItem);
  writeJSON(KEYS.MENU, menu);
  return newItem;
}

export function updateMenuItem(id, perubahan) {
  const menu = getMenu();
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) throw new Error(`Menu dengan id "${id}" tidak ditemukan.`);
  menu[idx] = { ...menu[idx], ...perubahan };
  writeJSON(KEYS.MENU, menu);
  return menu[idx];
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────

export function getOrders() {
  return readJSON(KEYS.ORDERS) || [];
}

export function getOrderByNomor(nomorPesanan) {
  return getOrders().find(o => o.nomorPesanan === nomorPesanan) || null;
}

export function saveOrder(order) {
  const orders = getOrders();
  orders.push(order);
  writeJSON(KEYS.ORDERS, orders);
}

export function updateOrderStatus(nomorPesanan, statusBaru) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.nomorPesanan === nomorPesanan);
  if (idx === -1) throw new Error(`Pesanan "${nomorPesanan}" tidak ditemukan.`);
  orders[idx].statusPengerjaan = statusBaru;
  writeJSON(KEYS.ORDERS, orders);
  return orders[idx];
}

export function cancelOrder(nomorPesanan, alasan, dibatalkanOleh) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.nomorPesanan === nomorPesanan);
  if (idx === -1) throw new Error(`Pesanan "${nomorPesanan}" tidak ditemukan.`);
  orders[idx].dibatalkan = true;
  orders[idx].alasanBatal = alasan;
  orders[idx].waktuBatal = nowJakarta();
  orders[idx].dibatalkanOleh = dibatalkanOleh;
  writeJSON(KEYS.ORDERS, orders);
  return orders[idx];
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

export function getPayments() {
  return readJSON(KEYS.PAYMENTS) || [];
}

export function getPaymentByNomor(nomorPesanan) {
  return getPayments().find(p => p.nomorPesanan === nomorPesanan) || null;
}

export function savePayment(payment) {
  const payments = getPayments();
  payments.push(payment);
  writeJSON(KEYS.PAYMENTS, payments);
}

export function updatePaymentStatus(nomorPesanan, statusBaru, detail = {}) {
  const payments = getPayments();
  const idx = payments.findIndex(p => p.nomorPesanan === nomorPesanan);
  if (idx === -1) throw new Error(`Data pembayaran untuk "${nomorPesanan}" tidak ditemukan.`);
  payments[idx] = {
    ...payments[idx],
    status: statusBaru,
    waktuVerifikasi: detail.waktuVerifikasi || null,
    dikonfirmasiOleh: detail.dikonfirmasiOleh || null,
    referensi: detail.referensi !== undefined ? detail.referensi : payments[idx].referensi,
    uangDiterima: detail.uangDiterima !== undefined ? detail.uangDiterima : payments[idx].uangDiterima,
    kembalian: detail.kembalian !== undefined ? detail.kembalian : payments[idx].kembalian,
  };
  writeJSON(KEYS.PAYMENTS, payments);
  return payments[idx];
}

// ─── USERS ───────────────────────────────────────────────────────────────────

export function getUsers() {
  return readJSON(KEYS.USERS) || [];
}

export function getUserById(id) {
  return getUsers().find(u => u.id === id) || null;
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────

export function getAuditLog() {
  return readJSON(KEYS.AUDIT_LOG) || [];
}

export function appendAuditLog(entry) {
  const log = getAuditLog();
  log.push({
    id: 'log_' + uid(),
    waktu: nowJakarta(),
    nomorPesanan: entry.nomorPesanan || null,
    aksi: entry.aksi,
    nilaiLama: entry.nilaiLama !== undefined ? entry.nilaiLama : null,
    nilaiBaru: entry.nilaiBaru !== undefined ? entry.nilaiBaru : null,
    aktor: entry.aktor || 'Sistem',
  });
  writeJSON(KEYS.AUDIT_LOG, log);
}

// ─── COUNTER / NOMOR PESANAN ──────────────────────────────────────────────────

export function generateNomorPesanan() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const tanggalStr = `${yyyy}${mm}${dd}`;

  let counter = readJSON(KEYS.COUNTERS) || { tanggal: '', urutan: 0 };

  if (counter.tanggal !== tanggalStr) {
    counter = { tanggal: tanggalStr, urutan: 0 };
  }
  counter.urutan += 1;
  writeJSON(KEYS.COUNTERS, counter);

  const urutan = String(counter.urutan).padStart(3, '0');
  return `MB-${tanggalStr}-${urutan}`;
}

// ─── SESSION (sessionStorage) — Owner ────────────────────────────────────────

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** peran default 'owner' agar kode lama tidak pecah */
export function setSession(userId, nama, peran = 'owner') {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, nama, peran }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ─── SESSION (sessionStorage) — Customer ─────────────────────────────────────

const CUSTOMER_SESSION_KEY = 'mb_session_customer';

export function getCustomerSession() {
  try {
    const raw = sessionStorage.getItem(CUSTOMER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCustomerSession(userId, nama, nomorHp) {
  sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ userId, nama, nomorHp }));
}

export function clearCustomerSession() {
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

/** Semua user berperan 'customer'. */
export function getCustomers() {
  return getUsers().filter(u => u.peran === 'customer');
}

/** Cari customer berdasarkan nomor HP (normalisasi strip spasi/tanda hubung). */
export function getCustomerByHp(nomorHp) {
  const normalized = normalizeHp(nomorHp);
  return getCustomers().find(u => normalizeHp(u.nomorHp) === normalized) || null;
}

/** Cari customer berdasarkan id, hanya yang berperan 'customer'. */
export function getCustomerById(id) {
  const user = getUserById(id);
  return user && user.peran === 'customer' ? user : null;
}

/**
 * Simpan customer baru. Lempar error jika HP sudah terdaftar.
 * @param {{ nama, nomorHp, pinHash }} data
 */
export function saveCustomer(data) {
  if (getCustomerByHp(data.nomorHp)) {
    throw new Error('Nomor HP sudah terdaftar. Gunakan nomor lain atau masuk dengan akun yang ada.');
  }
  const users = getUsers();
  const newCustomer = {
    id: 'cust_' + uid(),
    nama: data.nama.trim(),
    peran: 'customer',
    nomorHp: normalizeHp(data.nomorHp),
    pinHash: data.pinHash,
  };
  users.push(newCustomer);
  writeJSON(KEYS.USERS, users);
  return newCustomer;
}

/** Reset PIN customer — dipanggil oleh pemilik dari index.html. */
export function resetCustomerPin(customerId, newPinHash) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === customerId && u.peran === 'customer');
  if (idx === -1) throw new Error('Akun customer tidak ditemukan.');
  users[idx].pinHash = newPinHash;
  writeJSON(KEYS.USERS, users);
}

/** Normalisasi nomor HP: 628xx → 08xx, strip non-digit. */
function normalizeHp(hp) {
  let s = String(hp).replace(/\D/g, '');
  if (s.startsWith('62')) s = '0' + s.slice(2);
  return s;
}

// ─── ORDERS — tambahan untuk self-order ──────────────────────────────────────

/**
 * Ambil semua pesanan milik satu customer.
 * Field `customerId` pada order lama mungkin tidak ada → diabaikan.
 */
export function getOrdersByCustomer(customerId) {
  return getOrders().filter(o => o.customerId === customerId);
}
