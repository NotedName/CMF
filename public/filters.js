// ==================== Filter Helpers ====================
import { debounce } from './utils.js';

let searchTimeout;

export function applyFilters() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const tableId = isLogTable ? '#clearanceLogTable' : '#homeTable';
  const table = document.querySelector(tableId);
  if (!table) return;
  const searchInput = document.getElementById('search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  const semesterFilter = document.getElementById('semesterFilter')?.value || '';
  const remarksFilter = document.getElementById('remarksFilter')?.value || '';
  const courseFilterLogs = document.getElementById('courseFilterLogs')?.value || '';
  const yearFilterLogs = document.getElementById('yearFilterLogs')?.value || '';
  const courseFilterHome = document.getElementById('courseFilter')?.value || '';
  const yearFilterHome = document.getElementById('yearFilter')?.value || '';
  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) show = false;
    if (show && isLogTable) {
      const statusCell = row.cells[11];
      const semesterCell = row.cells[7];
      const remarksCell = row.cells[10];
      const courseCell = row.cells[9];
      const yearCell = row.cells[8];
      if (statusFilter && statusCell && statusCell.innerText.trim() !== statusFilter) show = false;
      if (show && semesterFilter && semesterCell && semesterCell.innerText.trim() !== semesterFilter) show = false;
      if (show && remarksFilter && remarksCell && remarksCell.innerText.trim() !== remarksFilter) show = false;
      if (show && courseFilterLogs && courseCell && courseCell.innerText.trim() !== courseFilterLogs) show = false;
      if (show && yearFilterLogs && yearCell && yearCell.innerText.trim() !== yearFilterLogs) show = false;
    } else if (show) {
      const courseCell = row.cells[4];
      const yearCell = row.cells[5];
      if (courseFilterHome && courseCell && courseCell.innerText.trim() !== courseFilterHome) show = false;
      if (show && yearFilterHome && yearCell && yearCell.innerText.trim() !== yearFilterHome) show = false;
    }
    row.style.display = show ? '' : 'none';
  });
}

export function clearFilters() {
  document.getElementById('search').value = '';
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.value = '';
  const semesterFilter = document.getElementById('semesterFilter');
  if (semesterFilter) semesterFilter.value = '';
  const remarksFilter = document.getElementById('remarksFilter');
  if (remarksFilter) remarksFilter.value = '';
  const courseFilterLogs = document.getElementById('courseFilterLogs');
  if (courseFilterLogs) courseFilterLogs.value = '';
  const yearFilterLogs = document.getElementById('yearFilterLogs');
  if (yearFilterLogs) yearFilterLogs.value = '';
  const courseFilterHome = document.getElementById('courseFilter');
  if (courseFilterHome) courseFilterHome.value = '';
  const yearFilterHome = document.getElementById('yearFilter');
  if (yearFilterHome) yearFilterHome.value = '';
  applyFilters();
}

export function refreshTable() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const isStatusUpdate = window.location.pathname.includes('statusupdate.html');
  if (isStatusUpdate && window.currentStudentForUpdate) {
    if (!confirm('Refreshing will clear the current student details. Continue?')) return;
    document.getElementById('studentResult').style.display = 'none';
    window.currentStudentForUpdate = null;
  }
  if (isLogTable) {
    import('./clearance.js').then(module => module.loadClearanceLogs());
  } else {
    import('./students.js').then(module => module.loadStudents());
  }
}

// Debounced search
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('keyup', debounce(applyFilters, 500));
  }
});