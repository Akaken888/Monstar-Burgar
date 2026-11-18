/**
 * ui.js — Komponen UI bersama: Toast, Modal
 * Monstar Burgers Order Manager
 *
 * Dipisah dari app.js agar tidak menyebabkan circular dependency.
 */

// ─── Toast ────────────────────────────────────────────────────────────────────

/**
 * Tampilkan notifikasi singkat.
 * @param {string} message
 * @param {'default'|'success'|'error'|'warning'} type
 */
export function showToast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast${type !== 'default' ? ` toast--${type}` : ''}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/**
 * Buka modal dengan judul dan konten.
 * @param {string} title
 * @param {string|Node} bodyContent
 */
export function openModal(title, bodyContent) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl  = document.getElementById('modalBody');
  if (!overlay) return;

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.innerHTML = '';
    if (typeof bodyContent === 'string') {
      bodyEl.innerHTML = bodyContent;
    } else if (bodyContent instanceof Node) {
      bodyEl.appendChild(bodyContent);
    }
  }

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

/** Tutup modal yang sedang terbuka. */
export function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
}

/** Inisialisasi event close modal (harus dipanggil sekali saat init). */
export function bindModalClose() {
  const overlay = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}
