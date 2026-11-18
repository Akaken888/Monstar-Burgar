/**
 * customer-auth.js — Registrasi & login pelanggan
 * Monstar Burgers Self-Order
 */

import {
  hashPin,
  getCustomerByHp,
  saveCustomer,
  getCustomerSession,
  setCustomerSession,
  clearCustomerSession,
} from './storage.js';

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Daftarkan akun customer baru.
 * @param {{ nama: string, nomorHp: string, pin: string }} data
 */
export async function registerCustomer({ nama, nomorHp, pin }) {
  // Validasi nama
  if (!nama || nama.trim().length < 2) {
    throw new Error('Nama minimal 2 karakter.');
  }
  // Validasi HP
  const hp = String(nomorHp).replace(/\D/g, '');
  if (!hp.match(/^(08|628)\d{7,11}$/)) {
    throw new Error('Nomor HP tidak valid. Contoh: 081234567890');
  }
  // Validasi PIN
  if (!pin || !String(pin).match(/^\d{4,6}$/)) {
    throw new Error('PIN harus 4–6 digit angka.');
  }

  const pinHash = await hashPin(pin);
  const customer = saveCustomer({ nama: nama.trim(), nomorHp, pinHash });
  setCustomerSession(customer.id, customer.nama, customer.nomorHp);
  return customer;
}

/**
 * Login customer.
 * @returns {Promise<boolean>}
 */
export async function loginCustomer(nomorHp, pin) {
  if (!nomorHp || !pin) return false;
  const customer = getCustomerByHp(nomorHp);
  if (!customer) return false;

  const inputHash = await hashPin(pin);
  if (inputHash !== customer.pinHash) return false;

  setCustomerSession(customer.id, customer.nama, customer.nomorHp);
  return true;
}

/** Hapus sesi customer. */
export function logoutCustomer() {
  clearCustomerSession();
}

/** Kembalikan sesi customer aktif atau null. */
export function getActiveCustomer() {
  return getCustomerSession();
}

// ─── Render ───────────────────────────────────────────────────────────────────

let activeAuthTab = 'login'; // 'login' | 'register'

/**
 * Render form auth (login + registrasi) ke dalam elemen target.
 * @param {HTMLElement} container
 * @param {Function} onSuccess dipanggil setelah login/register berhasil
 */
export function renderAuthPage(container, onSuccess) {
  if (!container) return;
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'auth-wrap';
  wrap.innerHTML = `
    <div class="auth-brand">
      <div class="auth-brand__logo">🍔</div>
      <h1 class="auth-brand__title">Monstar Burgers</h1>
      <p class="auth-brand__sub">Pesan sendiri, mudah & cepat</p>
    </div>

    <div class="auth-tabs" role="tablist" aria-label="Tab autentikasi">
      <button class="auth-tab auth-tab--active" data-auth-tab="login"
        role="tab" aria-selected="true">Masuk</button>
      <button class="auth-tab" data-auth-tab="register"
        role="tab" aria-selected="false">Daftar Baru</button>
    </div>

    <div class="card auth-card">
      <!-- Form Login -->
      <div data-auth-form="login">
        <form class="auth-card__form" id="loginForm" novalidate>
          <div class="form-group">
            <label for="loginHp" class="form-label">Nomor HP</label>
            <input type="tel" id="loginHp" class="form-input"
              inputmode="numeric" placeholder="Contoh: 081234567890"
              maxlength="15" autocomplete="tel" />
          </div>
          <div class="form-group">
            <label for="loginPin" class="form-label">PIN <span class="form-hint">(4–6 digit)</span></label>
            <input type="password" id="loginPin" class="form-input form-input--pin"
              inputmode="numeric" maxlength="6" placeholder="••••"
              autocomplete="current-password" />
          </div>
          <p class="form-error" id="loginError" hidden></p>
          <button type="submit" class="btn btn--primary btn--full" id="loginSubmitBtn">
            Masuk
          </button>
        </form>
      </div>

      <!-- Form Register -->
      <div data-auth-form="register" hidden>
        <form class="auth-card__form" id="registerForm" novalidate>
          <div class="form-group">
            <label for="regNama" class="form-label">Nama Lengkap</label>
            <input type="text" id="regNama" class="form-input"
              placeholder="Contoh: Budi Santoso" maxlength="60"
              autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="regHp" class="form-label">Nomor HP</label>
            <input type="tel" id="regHp" class="form-input"
              inputmode="numeric" placeholder="Contoh: 081234567890"
              maxlength="15" autocomplete="tel" />
          </div>
          <div class="form-group">
            <label for="regPin" class="form-label">Buat PIN <span class="form-hint">(4–6 digit angka)</span></label>
            <input type="password" id="regPin" class="form-input form-input--pin"
              inputmode="numeric" maxlength="6" placeholder="••••"
              autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label for="regPinConfirm" class="form-label">Ulangi PIN</label>
            <input type="password" id="regPinConfirm" class="form-input form-input--pin"
              inputmode="numeric" maxlength="6" placeholder="••••"
              autocomplete="new-password" />
          </div>
          <p class="form-error" id="registerError" hidden></p>
          <button type="submit" class="btn btn--primary btn--full" id="registerSubmitBtn">
            Buat Akun
          </button>
        </form>
      </div>
    </div>

    <p class="auth-footer">Data tersimpan di perangkat ini</p>
  `;

  container.appendChild(wrap);
  bindAuthTabEvents(wrap);
  bindLoginForm(wrap, onSuccess);
  bindRegisterForm(wrap, onSuccess);

  // Fokus ke input pertama
  setTimeout(() => wrap.querySelector('#loginHp')?.focus(), 100);
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindAuthTabEvents(wrap) {
  wrap.querySelectorAll('[data-auth-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      activeAuthTab = tab.dataset.authTab;

      wrap.querySelectorAll('[data-auth-tab]').forEach(t => {
        t.classList.toggle('auth-tab--active', t.dataset.authTab === activeAuthTab);
        t.setAttribute('aria-selected', t.dataset.authTab === activeAuthTab ? 'true' : 'false');
      });

      wrap.querySelectorAll('[data-auth-form]').forEach(form => {
        form.hidden = form.dataset.authForm !== activeAuthTab;
      });

      // Fokus input pertama pada tab aktif
      setTimeout(() => {
        const firstInput = wrap.querySelector(`[data-auth-form="${activeAuthTab}"] input`);
        firstInput?.focus();
      }, 50);
    });
  });
}

function bindLoginForm(wrap, onSuccess) {
  const form = wrap.querySelector('#loginForm');
  const errorEl = wrap.querySelector('#loginError');
  const submitBtn = wrap.querySelector('#loginSubmitBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

    const hp = wrap.querySelector('#loginHp')?.value?.trim() || '';
    const pin = wrap.querySelector('#loginPin')?.value || '';

    if (!hp) { showError(errorEl, 'Masukkan nomor HP Anda.'); return; }
    if (!pin) { showError(errorEl, 'Masukkan PIN Anda.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memeriksa…';

    try {
      const ok = await loginCustomer(hp, pin);
      if (ok) {
        onSuccess?.();
      } else {
        showError(errorEl, 'Nomor HP atau PIN salah. Coba lagi.');
        wrap.querySelector('#loginPin').value = '';
        wrap.querySelector('#loginPin').focus();
      }
    } catch (err) {
      showError(errorEl, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Masuk';
    }
  });
}

function bindRegisterForm(wrap, onSuccess) {
  const form = wrap.querySelector('#registerForm');
  const errorEl = wrap.querySelector('#registerError');
  const submitBtn = wrap.querySelector('#registerSubmitBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

    const nama = wrap.querySelector('#regNama')?.value || '';
    const hp   = wrap.querySelector('#regHp')?.value?.trim() || '';
    const pin  = wrap.querySelector('#regPin')?.value || '';
    const pin2 = wrap.querySelector('#regPinConfirm')?.value || '';

    if (pin !== pin2) {
      showError(errorEl, 'PIN dan konfirmasi PIN tidak sama.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Membuat akun…';

    try {
      await registerCustomer({ nama, nomorHp: hp, pin });
      onSuccess?.();
    } catch (err) {
      showError(errorEl, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Buat Akun';
    }
  });
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}
