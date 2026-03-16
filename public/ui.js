// ==================== UI Helpers ====================
import { MODALS, ERROR_MESSAGES } from './constants.js';

// ---- Modal Functions ----
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'flex';
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

export function showMessageModal(text) {
  const msgEl = document.getElementById('messageModalText');
  if (msgEl) msgEl.innerText = text;
  showModal(MODALS.MESSAGE);
}

export function showErrorModal(errorCode, customMessage = null) {
  const message = customMessage || ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.default;
  showMessageModal(message);
}

// ---- Loading Spinner ----
export function showTableSpinner(tableId) {
  const table = document.querySelector(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const spinnerRow = document.createElement('tr');
  spinnerRow.id = 'loading-spinner-row';
  spinnerRow.innerHTML = `<td colspan="100" style="text-align: center;"><div class="loading-spinner" style="display: inline-block;"></div></td>`;
  tbody.innerHTML = '';
  tbody.appendChild(spinnerRow);
}

export function hideTableSpinner(tableId) {
  const table = document.querySelector(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const spinnerRow = document.getElementById('loading-spinner-row');
  if (spinnerRow) spinnerRow.remove();
}

// ---- Dark Mode ----
export function toggleDarkMode() {
  const body = document.body;
  body.classList.toggle('dark-mode');
  const icon = document.getElementById('darkModeIcon');
  if (icon) {
    icon.textContent = body.classList.contains('dark-mode') ? '☼' : '☾';
  }
  localStorage.setItem('darkMode', body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
}

export function loadDarkModePreference() {
  const darkMode = localStorage.getItem('darkMode');
  const icon = document.getElementById('darkModeIcon');
  if (darkMode === 'enabled') {
    document.body.classList.add('dark-mode');
    if (icon) icon.textContent = '☼';
  } else {
    if (icon) icon.textContent = '☾';
  }
}

// ---- Mobile Menu ----
export function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.menu-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
  }
}

export function closeMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.menu-overlay');
  if (sidebar && overlay) {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  }
}

// ---- Scroll to Top ----
export function initScrollToTop() {
  const btn = document.getElementById('scrollToTopBtn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---- Hover Scroll for Selects ----
export function enableHoverScroll(selector) {
  document.querySelectorAll(selector).forEach(select => {
    select.addEventListener('wheel', (e) => {
      if (document.activeElement !== select) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 : -1;
        const newIndex = select.selectedIndex + delta;
        if (newIndex >= 0 && newIndex < select.options.length) {
          select.selectedIndex = newIndex;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, { passive: false });
  });
}

// ---- Pull to Refresh (simple) ----
export function enablePullToRefresh(callback) {
  let startY = 0;
  let pulling = false;
  const threshold = 150;

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 50 && diff < threshold) {
      // Optional: show visual indicator
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!pulling) return;
    const endY = e.changedTouches[0].clientY;
    const diff = endY - startY;
    if (diff > threshold) {
      callback();
    }
    pulling = false;
  });
}