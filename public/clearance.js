// clearance.js
import { db } from './firebase.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, limit, startAfter } from 'firebase/firestore';
import { showMessageModal, showErrorModal, showTableSpinner, hideTableSpinner } from './ui.js';
import { COLLECTIONS, PAGE_SIZE } from './constants.js';
import { formatFullName, sortArray } from './utils.js';

let clearanceLogs = [];
let lastVisible = null;
let currentPage = 1;
let totalPages = 1;
let currentFilters = { search: '', status: '', semester: '', remarks: '', course: '', year: '' };
let logSort = { column: 2, direction: 'asc' }; // name column

export async function loadClearanceLogs(page = 1, filters = currentFilters) {
  const table = document.getElementById('clearanceLogTable');
  if (!table) return;
  showTableSpinner('#clearanceLogTable');
  try {
    let q = query(collection(db, COLLECTIONS.CLEARANCE_LOGS), orderBy('timestamp', 'desc'));
    // For simplicity, we'll fetch all and paginate client-side, but for production use server-side pagination with filters.
    const snapshot = await getDocs(q);
    clearanceLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    totalPages = Math.ceil(clearanceLogs.length / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageData = clearanceLogs.slice(start, end);
    renderClearanceLogs(pageData);
    populateLogFilters();
    hideTableSpinner('#clearanceLogTable');
  } catch (err) {
    showErrorModal(err.code, 'Failed to load clearance logs.');
    hideTableSpinner('#clearanceLogTable');
  }
}

function renderClearanceLogs(logs) {
  const tbody = document.querySelector('#clearanceLogTable tbody');
  if (!tbody) return;
  const sorted = sortLogs(logs, logSort.column, logSort.direction);
  tbody.innerHTML = sorted.map(log => {
    const releaseDate = log.claimedDate ? new Date(log.claimedDate.seconds * 1000).toLocaleString() : '';
    const receiveDate = log.returnedDate ? new Date(log.returnedDate.seconds * 1000).toLocaleString() : '';
    return `
      <tr>
        <td class="checkbox-cell"><input type="checkbox" class="log-checkbox" data-log-id="${log.id}" onchange="window.updateSelectAllLogsState?.()"></td>
        <td>${escapeHtml(log.rfid || '')}</td>
        <td>${escapeHtml(log.studentNumber || '')}</td>
        <td>${escapeHtml(log.name || '')}</td>
        <td>${escapeHtml(releaseDate)}</td>
        <td>${escapeHtml(receiveDate)}</td>
        <td>${escapeHtml(log.academicYear || '')}</td>
        <td>${escapeHtml(log.semester || '')}</td>
        <td>${escapeHtml(log.yearLevel || '')}</td>
        <td>${escapeHtml(log.program || '')}</td>
        <td>${escapeHtml(log.remarks || '')}</td>
        <td>${escapeHtml(log.status || '')}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

function sortLogs(logs, columnIndex, direction) {
  const prop = getLogSortProperty(columnIndex);
  if (!prop) return logs;
  return sortArray(logs, prop, direction, (item, prop) => {
    if (prop === 'claimedDate' || prop === 'returnedDate') {
      return item[prop] ? item[prop].seconds : 0;
    }
    return item[prop];
  });
}

function getLogSortProperty(columnIndex) {
  const map = {
    1: 'rfid',
    2: 'studentNumber',
    3: 'name',
    4: 'claimedDate',
    5: 'returnedDate',
    6: 'academicYear',
    7: 'semester',
    8: 'yearLevel',
    9: 'program',
    10: 'remarks',
    11: 'status'
  };
  return map[columnIndex];
}

export function handleLogSort(columnIndex) {
  if (logSort.column === columnIndex) {
    logSort.direction = logSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    logSort.column = columnIndex;
    logSort.direction = 'asc';
  }
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = clearanceLogs.slice(start, end);
  renderClearanceLogs(pageData);
  updateLogSortIndicators(columnIndex, logSort.direction);
}

function updateLogSortIndicators(columnIndex, direction) {
  const headers = document.querySelectorAll('#clearanceLogTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  if (headers[columnIndex]) {
    headers[columnIndex].classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function populateLogFilters() {
  const semesterSet = new Set();
  const remarksSet = new Set();
  const courseSet = new Set();
  const yearSet = new Set();
  clearanceLogs.forEach(log => {
    if (log.semester) semesterSet.add(log.semester);
    if (log.remarks) remarksSet.add(log.remarks);
    if (log.program) courseSet.add(log.program);
    if (log.yearLevel) yearSet.add(log.yearLevel);
  });
  const semesterFilter = document.getElementById('semesterFilter');
  if (semesterFilter) {
    semesterFilter.innerHTML = '<option value="">All</option>' + [...semesterSet].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  }
  const remarksFilter = document.getElementById('remarksFilter');
  if (remarksFilter) {
    remarksFilter.innerHTML = '<option value="">All</option>' + [...remarksSet].sort().map(r => `<option value="${r}">${r}</option>`).join('');
  }
  const courseFilter = document.getElementById('courseFilterLogs');
  if (courseFilter) {
    courseFilter.innerHTML = '<option value="">All</option>' + [...courseSet].sort().map(c => `<option value="${c}">${c}</option>`).join('');
  }
  const yearFilter = document.getElementById('yearFilterLogs');
  if (yearFilter) {
    yearFilter.innerHTML = '<option value="">All</option>' + [...yearSet].sort().map(y => `<option value="${y}">${y}</option>`).join('');
  }
}

function applyFilters() {
  const search = document.getElementById('search')?.value.toLowerCase() || '';
  const status = document.getElementById('statusFilter')?.value || '';
  const semester = document.getElementById('semesterFilter')?.value || '';
  const remarks = document.getElementById('remarksFilter')?.value || '';
  const course = document.getElementById('courseFilterLogs')?.value || '';
  const year = document.getElementById('yearFilterLogs')?.value || '';
  const rows = document.querySelectorAll('#clearanceLogTable tbody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    let show = true;
    if (search && !text.includes(search)) show = false;
    if (show && status && row.cells[11]?.innerText !== status) show = false;
    if (show && semester && row.cells[7]?.innerText !== semester) show = false;
    if (show && remarks && row.cells[10]?.innerText !== remarks) show = false;
    if (show && course && row.cells[9]?.innerText !== course) show = false;
    if (show && year && row.cells[8]?.innerText !== year) show = false;
    row.style.display = show ? '' : 'none';
  });
}

// ---- Release/Receive ----
let isProcessing = false;

export async function releaseStudent(rfid, remarks, acadYear, semester) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // Check for open claim
    const openClaim = await findOpenClaim(rfid);
    if (openClaim) {
      showMessageModal('Student has already claimed. Please return first.');
      return;
    }
    // Get student data
    const studentRef = doc(db, COLLECTIONS.STUDENTS, rfid);
    const studentSnap = await getDoc(studentRef);
    if (!studentSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const student = studentSnap.data();
    const logData = {
      rfid: rfid,
      studentNumber: student.studentNumber || '',
      name: formatFullName(student),
      program: student.program || '',
      yearLevel: student.yearLevel || '',
      status: 'Claimed',
      claimedDate: new Date(),
      returnedDate: null,
      academicYear: acadYear,
      semester: semester,
      remarks: remarks,
      timestamp: new Date()
    };
    await addDoc(collection(db, COLLECTIONS.CLEARANCE_LOGS), logData);
    showMessageModal('Student clearance form released successfully.');
    clearStatusUpdate();
    await loadClearanceLogs();
  } catch (err) {
    showErrorModal(err.code, 'Release failed.');
  } finally {
    isProcessing = false;
  }
}

export async function receiveStudent(rfid, remarks, acadYear, semester) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const openClaim = await findOpenClaim(rfid);
    if (!openClaim) {
      showMessageModal('Student has yet to claim form. Please release first.');
      return;
    }
    await updateDoc(doc(db, COLLECTIONS.CLEARANCE_LOGS, openClaim.id), {
      status: 'Returned',
      returnedDate: new Date(),
      remarks: remarks,
      academicYear: acadYear,
      semester: semester
    });
    showMessageModal('Student clearance form has been returned successfully.');
    clearStatusUpdate();
    await loadClearanceLogs();
  } catch (err) {
    showErrorModal(err.code, 'Receive failed.');
  } finally {
    isProcessing = false;
  }
}

async function findOpenClaim(rfid) {
  const q = query(
    collection(db, COLLECTIONS.CLEARANCE_LOGS),
    where('rfid', '==', rfid),
    where('status', '==', 'Claimed'),
    where('returnedDate', '==', null),
    orderBy('claimedDate', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  return null;
}

export function clearStatusUpdate() {
  document.getElementById('rfidSearch').value = '';
  const resultDiv = document.getElementById('studentResult');
  if (resultDiv) resultDiv.style.display = 'none';
}

// ---- Delete logs (superadmin only) ----
let pendingDeleteLogIds = [];
export function deleteSelectedLogs() {
  const selected = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one log to delete.');
    return;
  }
  pendingDeleteLogIds = Array.from(selected).map(cb => cb.getAttribute('data-log-id'));
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selected.length} selected log(s)?`;
  showModal('confirmModal');
}

export async function confirmDeleteLogs() {
  const ids = [...pendingDeleteLogIds];
  closeModal('confirmModal');
  try {
    const promises = ids.map(id => deleteDoc(doc(db, COLLECTIONS.CLEARANCE_LOGS, id)));
    await Promise.all(promises);
    await loadClearanceLogs();
    showMessageModal('Selected logs deleted.');
  } catch (err) {
    showErrorModal(err.code, 'Delete failed.');
  } finally {
    pendingDeleteLogIds = [];
  }
}

// ---- Select All ----
export function toggleSelectAllLogs(checkbox) {
  const checkboxes = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateSelectAllLogsState();
}

export function updateSelectAllLogsState() {
  const selectAll = document.getElementById('selectAllLogs');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox');
  selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}