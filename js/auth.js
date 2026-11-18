/**
 * auth.js — Autentikasi & manajemen sesi (owner + customer)
 * Monstar Burgers Order Manager
 */

import {
  hashPin, getUsers, getCustomerByHp, saveCustomer,
  getSession, setSession, clearSession,
  getCustomerSession, setCustomerSession, clearCustomerSession,
} from './storage.js';

// ─── Owner Auth ───────────────────────────────────────────────────────────────

export async function login(userId, pin) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return false;
  const inputHash = await hashPin(pin);
  if (inputHash !== user.pinHash) return false;
  setSession(userId, user.nama, 'owner');
  return true;
}

export function logout() { clearSession(); }
export function getActiveSession() { return getSession(); }
export function getActiveName() { const s = getSession(); return s ? s.nama : ''; }

// ─── Customer Auth ────────────────────────────────────────────────────────────

export async function loginCustomer(nomorHp, pin) {
  const customer = getCustomerByHp(nomorHp);
  if (!customer) return false;
  const inputHash = await hashPin(pin);
  if (inputHash !== customer.pinHash) return false;
  setCustomerSession(customer.id, customer.nama, customer.nomorHp);
  return true;
}

export async function registerCustomer({ nama, nomorHp, pin }) {
  if (!nama || nama.trim().length < 2)
    throw new Error('Nama minimal 2 karakter.');
  const hp = String(nomorHp).replace(/\D/g, '');
  if (!hp.match(/^(08|628)\d{7,11}$/))
    throw new Error('Nomor HP tidak valid. Contoh: 081234567890');
  if (!pin || !String(pin).match(/^\d{4,6}$/))
    throw new Error('PIN harus 4–6 digit angka.');

  const pinHash = await hashPin(pin);
  const customer = saveCustomer({ nama: nama.trim(), nomorHp, pinHash });
  setCustomerSession(customer.id, customer.nama, customer.nomorHp);
  return customer;
}

export function logoutCustomer() { clearCustomerSession(); }
export function getActiveCustomer() { return getCustomerSession(); }

// ─── Render & Bind ────────────────────────────────────────────────────────────

let selectedUserId = null;
let ownerPanelOpen = false;

export function renderLoginPage() {
  // Render tombol-tombol owner
  const container = document.getElementById('loginUserBtns');
  if (container) {
    container.innerHTML = '';
    const owners = getUsers().filter(u => u.peran === 'owner');
    owners.forEach(user => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'login-user-btn';
      btn.setAttribute('aria-label', `Masuk sebagai ${user.nama}`);
      btn.dataset.userId = user.id;
      btn.innerHTML = `
        <div class="user-avatar" aria-hidden="true">${user.nama.charAt(0)}</div>
        <span>${user.nama}</span>`;
      btn.addEventListener('click', () => _selectOwner(user.id, user.nama));
      container.appendChild(btn);
    });
  }

  // Reset state
  selectedUserId = null;
  ownerPanelOpen = false;

  // Reset ke tab Masuk
  _switchCustomerTab('login');

  // Sembunyikan owner panel
  const ownerPanel = document.getElementById('ownerPanel');
  if (ownerPanel) ownerPanel.hidden = true;
  const chevron = document.getElementById('ownerChevron');
  if (chevron) chevron.textContent = '▼';

  // Sembunyikan PIN section
  const pinSection = document.getElementById('loginPinSection');
  if (pinSection) pinSection.hidden = true;

  // Clear semua error
  ['loginCustError','registerError','loginPinError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.textContent = ''; }
  });
}

function _switchCustomerTab(mode) {
  const loginForm    = document.getElementById('custLoginForm');
  const registerForm = document.getElementById('custRegisterForm');
  const tabLogin     = document.getElementById('tabLoginBtn');
  const tabRegister  = document.getElementById('tabRegisterBtn');

  if (!loginForm || !registerForm) return;

  if (mode === 'login') {
    loginForm.hidden    = false;
    registerForm.hidden = true;
    tabLogin?.classList.add('login-mode-tab--active');
    tabRegister?.classList.remove('login-mode-tab--active');
    setTimeout(() => document.getElementById('loginCustHp')?.focus(), 50);
  } else {
    loginForm.hidden    = true;
    registerForm.hidden = false;
    tabRegister?.classList.add('login-mode-tab--active');
    tabLogin?.classList.remove('login-mode-tab--active');
    setTimeout(() => document.getElementById('regNama')?.focus(), 50);
  }
}

function _selectOwner(userId, nama) {
  selectedUserId = userId;
  const pinSection  = document.getElementById('loginPinSection');
  const selectedName = document.getElementById('loginSelectedName');
  const pinInput    = document.getElementById('loginPinInput');
  const pinError    = document.getElementById('loginPinError');
  const userBtns    = document.getElementById('loginUserBtns');

  if (selectedName) selectedName.textContent = nama;
  if (pinSection)  pinSection.hidden = false;
  if (userBtns)    userBtns.style.display = 'none';
  if (pinError)    { pinError.hidden = true; pinError.textContent = ''; }
  if (pinInput)    { pinInput.value = ''; pinInput.focus(); }
}

export function bindLoginEvents(onLoginSuccess) {
  // ── Tab Masuk / Daftar ──
  document.getElementById('tabLoginBtn')?.addEventListener('click', () => _switchCustomerTab('login'));
  document.getElementById('tabRegisterBtn')?.addEventListener('click', () => _switchCustomerTab('register'));

  // ── Toggle panel Owner ──
  document.getElementById('ownerToggleBtn')?.addEventListener('click', () => {
    ownerPanelOpen = !ownerPanelOpen;
    const panel   = document.getElementById('ownerPanel');
    const chevron = document.getElementById('ownerChevron');
    if (panel)   panel.hidden = !ownerPanelOpen;
    if (chevron) chevron.textContent = ownerPanelOpen ? '▲' : '▼';

    if (ownerPanelOpen) {
      // Reset PIN section jika panel dibuka ulang
      const pinSection = document.getElementById('loginPinSection');
      if (pinSection) pinSection.hidden = true;
      const userBtns = document.getElementById('loginUserBtns');
      if (userBtns) userBtns.style.display = '';
      selectedUserId = null;
    }
  });

  // ── Login Owner ──
  const submitBtn  = document.getElementById('loginSubmitBtn');
  const pinInput   = document.getElementById('loginPinInput');
  const pinError   = document.getElementById('loginPinError');
  const backBtn    = document.getElementById('loginBackBtn');

  async function attemptOwnerLogin() {
    if (!selectedUserId) return;
    const pin = pinInput?.value.trim() || '';
    if (!pin) { _showErr(pinError, 'Masukkan PIN Anda.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memeriksa…';
    const ok = await login(selectedUserId, pin);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Masuk';

    if (ok) {
      onLoginSuccess('owner');
    } else {
      _showErr(pinError, 'PIN salah. Coba lagi.');
      if (pinInput) { pinInput.value = ''; pinInput.focus(); }
    }
  }

  submitBtn?.addEventListener('click', attemptOwnerLogin);
  pinInput?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptOwnerLogin(); });

  backBtn?.addEventListener('click', () => {
    selectedUserId = null;
    document.getElementById('loginPinSection').hidden = true;
    document.getElementById('loginUserBtns').style.display = '';
    if (pinInput) pinInput.value = '';
    _clearErr(pinError);
  });

  // ── Login Customer ──
  const custSubmitBtn = document.getElementById('loginCustSubmitBtn');
  const custHp        = document.getElementById('loginCustHp');
  const custPin       = document.getElementById('loginCustPin');
  const custError     = document.getElementById('loginCustError');

  async function attemptCustomerLogin() {
    _clearErr(custError);
    const hp  = custHp?.value.trim() || '';
    const pin = custPin?.value || '';
    if (!hp)  { _showErr(custError, 'Masukkan nomor HP Anda.'); return; }
    if (!pin) { _showErr(custError, 'Masukkan PIN Anda.'); return; }

    custSubmitBtn.disabled = true;
    custSubmitBtn.textContent = 'Memeriksa…';
    const ok = await loginCustomer(hp, pin);
    custSubmitBtn.disabled = false;
    custSubmitBtn.textContent = 'Masuk';

    if (ok) {
      onLoginSuccess('customer');
    } else {
      _showErr(custError, 'Nomor HP atau PIN salah. Coba lagi.');
      if (custPin) { custPin.value = ''; custPin.focus(); }
    }
  }

  custSubmitBtn?.addEventListener('click', attemptCustomerLogin);
  custPin?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptCustomerLogin(); });
  custHp?.addEventListener('keydown', e => { if (e.key === 'Enter') custPin?.focus(); });

  // ── Registrasi Customer ──
  const regSubmitBtn = document.getElementById('registerSubmitBtn');
  const regError     = document.getElementById('registerError');

  regSubmitBtn?.addEventListener('click', async () => {
    _clearErr(regError);
    const nama = document.getElementById('regNama')?.value || '';
    const hp   = document.getElementById('regHp')?.value?.trim() || '';
    const pin  = document.getElementById('regPin')?.value || '';
    const pin2 = document.getElementById('regPinConfirm')?.value || '';

    if (pin !== pin2) { _showErr(regError, 'PIN dan konfirmasi PIN tidak sama.'); return; }

    regSubmitBtn.disabled = true;
    regSubmitBtn.textContent = 'Membuat akun…';
    try {
      await registerCustomer({ nama, nomorHp: hp, pin });
      onLoginSuccess('customer');
    } catch (err) {
      _showErr(regError, err.message);
    } finally {
      regSubmitBtn.disabled = false;
      regSubmitBtn.textContent = 'Buat Akun';
    }
  });
}

function _showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function _clearErr(el) {
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}
