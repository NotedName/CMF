// ==================== Student Management ====================
import { db } from './firebase.js';
import { collection, getDocs, getDoc, setDoc, deleteDoc, doc, query, orderBy, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { showTableSpinner, hideTableSpinner, showMessageModal, showErrorModal, showModal, closeModal } from './ui.js';
import { COLLECTIONS, DEFAULT_SORT, SORT_DIRECTIONS, PAGE_SIZE } from './constants.js';
import { formatFullName, escapeHtml } from './utils.js';

let allStudents = [];
let currentPage = 1;
let totalPages = 1;
let currentFilters = { search: '', course: '', year: '' };
let homeSort = { ...DEFAULT_SORT.HOME };

export let pendingDeleteRfids = [];
export let pendingAdminDelete = [];

export async function loadStudents(page = 1, filters = currentFilters) {
  const table = document.getElementById('homeTable');
  if (!table) return;
  showTableSpinner('#homeTable');
  try {
    const q = query(collection(db, COLLECTIONS.STUDENTS), orderBy('dateTime', 'desc'));
    const snapshot = await getDocs(q);
    allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    totalPages = Math.ceil(allStudents.length / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageData = allStudents.slice(start, end);
    renderHomeTable(pageData);
    populateCourseFilter();
    hideTableSpinner('#homeTable');
  } catch (err) {
    showErrorModal(err.code, 'Failed to load students.');
    hideTableSpinner('#homeTable');
  }
}

function renderHomeTable(students) {
  const tbody = document.querySelector('#homeTable tbody');
  if (!tbody) return;
  const sorted = sortStudents(students, homeSort.column, homeSort.direction);
  tbody.innerHTML = sorted.map(student => {
    const fullName = formatFullName(student);
    const datePart = student.dateTime ? student.dateTime.split(' ')[0] : '';
    return `
      <tr>
        <td class="checkbox-cell"><input type="checkbox" class="home-checkbox" data-rfid="${escapeHtml(student.rfidNumber)}" onchange="window.updateSelectAllHomeState?.()"></td>
        <td>${escapeHtml(student.rfidNumber || '')}</td>
        <td>${escapeHtml(student.studentNumber || '')}</td>
        <td>${escapeHtml(fullName)}</td>
        <td>${escapeHtml(student.program || '')}</td>
        <td>${escapeHtml(student.yearLevel || '')}</td>
        <td>${escapeHtml(student.gender || '')}</td>
        <td>${escapeHtml(datePart)}</td>
      </tr>
    `;
  }).join('');
  applyClientFilters();
}

function sortStudents(students, columnIndex, direction) {
  const prop = getStudentSortProperty(columnIndex);
  if (!prop) return students;
  return [...students].sort((a, b) => {
    let valA, valB;
    if (prop === 'name') {
      valA = formatFullName(a).toLowerCase();
      valB = formatFullName(b).toLowerCase();
    } else {
      valA = (a[prop] || '').toLowerCase();
      valB = (b[prop] || '').toLowerCase();
    }
    if (valA < valB) return direction === SORT_DIRECTIONS.ASC ? -1 : 1;
    if (valA > valB) return direction === SORT_DIRECTIONS.ASC ? 1 : -1;
    return 0;
  });
}

function getStudentSortProperty(columnIndex) {
  const map = {
    1: 'rfidNumber',
    2: 'studentNumber',
    3: 'name',
    4: 'program',
    5: 'yearLevel',
    6: 'gender',
    7: 'dateTime'
  };
  return map[columnIndex];
}

function populateCourseFilter() {
  const select = document.getElementById('courseFilter');
  if (!select) return;
  const courses = [...new Set(allStudents.map(s => s.program).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All</option>' + 
    courses.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function applyClientFilters() {
  const search = document.getElementById('search')?.value.toLowerCase() || '';
  const course = document.getElementById('courseFilter')?.value || '';
  const year = document.getElementById('yearFilter')?.value || '';
  const rows = document.querySelectorAll('#homeTable tbody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    const courseCell = row.cells[4]?.innerText || '';
    const yearCell = row.cells[5]?.innerText || '';
    let show = true;
    if (search && !text.includes(search)) show = false;
    if (show && course && courseCell !== course) show = false;
    if (show && year && yearCell !== year) show = false;
    row.style.display = show ? '' : 'none';
  });
}

export function handleHomeSort(columnIndex) {
  if (homeSort.column === columnIndex) {
    homeSort.direction = homeSort.direction === SORT_DIRECTIONS.ASC ? SORT_DIRECTIONS.DESC : SORT_DIRECTIONS.ASC;
  } else {
    homeSort.column = columnIndex;
    homeSort.direction = SORT_DIRECTIONS.ASC;
  }
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = allStudents.slice(start, end);
  renderHomeTable(pageData);
  updateSortIndicators(columnIndex, homeSort.direction);
}

function updateSortIndicators(columnIndex, direction) {
  const headers = document.querySelectorAll('#homeTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  if (headers[columnIndex]) {
    headers[columnIndex].classList.add(direction === SORT_DIRECTIONS.ASC ? 'sort-asc' : 'sort-desc');
  }
}

// ---- Edit/Delete ----
export function editSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select a student to edit.');
    return;
  }
  if (selected.length > 1) {
    showMessageModal('Please select only one student to edit.');
    return;
  }
  const rfid = selected[0].getAttribute('data-rfid');
  window.location.href = `registrationPage.html?rfid=${encodeURIComponent(rfid)}`;
}

export function deleteSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one student to delete.');
    return;
  }
  pendingDeleteRfids = Array.from(selected).map(cb => cb.getAttribute('data-rfid'));
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selected.length} selected student(s)?`;
  showModal('confirmModal');
}

export async function confirmDelete() {
  const rfids = [...pendingDeleteRfids];
  closeModal('confirmModal');
  try {
    const promises = rfids.map(rfid => deleteDoc(doc(db, COLLECTIONS.STUDENTS, rfid)));
    await Promise.all(promises);
    await loadStudents(currentPage, currentFilters);
    showMessageModal('Selected students deleted.');
  } catch (err) {
    showErrorModal(err.code, 'Delete failed.');
  } finally {
    pendingDeleteRfids = [];
  }
}

// ---- Admin student management ----
let adminStudentSort = { ...DEFAULT_SORT.ADMIN };

export function renderAdminStudentsTable() {
  const tbody = document.querySelector('#adminStudentsTable tbody');
  if (!tbody) return;
  const sorted = sortAdminStudents(allStudents, adminStudentSort.column, adminStudentSort.direction);
  tbody.innerHTML = sorted.map(student => {
    const fullName = formatFullName(student);
    return `
      <tr>
        <td>${escapeHtml(student.rfidNumber || '')}</td>
        <td>${escapeHtml(fullName)}</td>
        <td>${escapeHtml(student.program || '')}</td>
        <td>${escapeHtml(student.yearLevel || '')}</td>
        <td>${escapeHtml(student.studentNumber || '')}</td>
        <td>${escapeHtml(student.dateTime || '')}</td>
        <td>${escapeHtml(student.gender || '')}</td>
        <td class="action-cell">
          <button onclick="editStudent('${student.rfidNumber}')" class="export-btn">Edit</button>
          <button onclick="deleteSingleStudent('${student.rfidNumber}')" class="delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
  filterAdminTable();
}

function sortAdminStudents(students, columnIndex, direction) {
  const prop = getAdminSortProperty(columnIndex);
  if (!prop) return students;
  return [...students].sort((a, b) => {
    let valA, valB;
    if (prop === 'name') {
      valA = formatFullName(a).toLowerCase();
      valB = formatFullName(b).toLowerCase();
    } else {
      valA = (a[prop] || '').toLowerCase();
      valB = (b[prop] || '').toLowerCase();
    }
    if (valA < valB) return direction === SORT_DIRECTIONS.ASC ? -1 : 1;
    if (valA > valB) return direction === SORT_DIRECTIONS.ASC ? 1 : -1;
    return 0;
  });
}

function getAdminSortProperty(columnIndex) {
  const map = {
    0: 'rfidNumber',
    1: 'name',
    2: 'program',
    3: 'yearLevel',
    4: 'studentNumber',
    5: 'dateTime',
    6: 'gender'
  };
  return map[columnIndex];
}

export function editStudent(rfid) {
  window.location.href = `registrationPage.html?rfid=${encodeURIComponent(rfid)}`;
}

export function deleteSingleStudent(rfid) {
  pendingAdminDelete = [rfid];
  document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this student?';
  showModal('confirmModal');
}

export async function confirmAdminDelete() {
  const rfids = [...pendingAdminDelete];
  closeModal('confirmModal');
  try {
    const promises = rfids.map(rfid => deleteDoc(doc(db, COLLECTIONS.STUDENTS, rfid)));
    await Promise.all(promises);
    await loadStudents();
    if (document.getElementById('adminStudentsTable')) renderAdminStudentsTable();
    showMessageModal('Selected students deleted.');
  } catch (err) {
    showErrorModal(err.code, 'Delete failed.');
  } finally {
    pendingAdminDelete = [];
  }
}

export function filterAdminTable() {
  const search = document.getElementById('adminSearch')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#adminStudentsTable tbody tr');
  rows.forEach(row => {
    const text = Array.from(row.cells).slice(0, -1).map(cell => cell.innerText.toLowerCase()).join(' ');
    row.style.display = (search === '' || text.includes(search)) ? '' : 'none';
  });
}

// ---- Registration page helpers ----
export async function checkRFID(rfid) {
  if (!rfid) return null;
  try {
    const docRef = doc(db, COLLECTIONS.STUDENTS, rfid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    showErrorModal(err.code, 'Error checking RFID.');
    return null;
  }
}

export async function registerStudent(formData) {
  const [year, month, day] = formData.date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const now = new Date();
  dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const h = String(dateObj.getHours()).padStart(2, '0');
  const i = String(dateObj.getMinutes()).padStart(2, '0');
  const s = String(dateObj.getSeconds()).padStart(2, '0');
  const dateTime = `${y}-${m}-${d} ${h}:${i}:${s}`;
  const student = {
    rfidNumber: formData.rfidNumber,
    surname: formData.surname,
    firstName: formData.firstName,
    middleName: formData.middleName,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    dateTime: dateTime,
    gender: formData.gender,
  };
  try {
    await setDoc(doc(db, COLLECTIONS.STUDENTS, formData.rfidNumber), student);
    showModal('successModal');
  } catch (err) {
    showErrorModal(err.code, 'Registration failed.');
  }
}

export async function updateStudent(rfid, updatedData) {
  try {
    const docRef = doc(db, COLLECTIONS.STUDENTS, rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return false;
    }
    const current = docSnap.data();
    const updated = {
      ...current,
      surname: updatedData.surname,
      firstName: updatedData.firstName,
      middleName: updatedData.middleName,
      program: updatedData.program,
      yearLevel: updatedData.yearLevel,
      studentNumber: updatedData.studentNumber,
      gender: updatedData.gender,
    };
    await setDoc(docRef, updated);
    showModal('updateSuccessModal');
    return true;
  } catch (err) {
    showErrorModal(err.code, 'Update failed.');
    return false;
  }
}

export async function isStudentNumberDuplicate(studentNumber, excludeRfid = null) {
  const q = query(collection(db, COLLECTIONS.STUDENTS), where('studentNumber', '==', studentNumber));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return false;
  if (excludeRfid) {
    return snapshot.docs.some(doc => doc.id !== excludeRfid);
  }
  return true;
}

export async function updateStudentsProgram(oldCode, newCode) {
  const q = query(collection(db, COLLECTIONS.STUDENTS), where('program', '==', oldCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    batch.update(docSnap.ref, { program: newCode });
  });
  await batch.commit();
}