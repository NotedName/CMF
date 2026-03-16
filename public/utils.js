// ==================== Shared Utilities ====================
export function formatFullName(student) {
  const surname = student.surname || '';
  const firstName = student.firstName || '';
  const middle = student.middleName ? ' ' + student.middleName : '';
  return surname ? `${surname}, ${firstName}${middle}` : (firstName + middle).trim();
}

export function escapeHtml(unsafe) {
  if (!unsafe) return unsafe;
  return unsafe.replace(/[&<>"']/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#039;';
    return m;
  });
}

export function sortArray(array, prop, direction = 'asc', transform = null) {
  return [...array].sort((a, b) => {
    let valA = transform ? transform(a, prop) : (a[prop] || '');
    let valB = transform ? transform(b, prop) : (b[prop] || '');
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function setDefaultDate() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}