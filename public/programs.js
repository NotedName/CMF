// programs.js
import { db } from './firebase.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { showMessageModal, showErrorModal, showModal, closeModal, showTableSpinner, hideTableSpinner } from './ui.js';
import { COLLECTIONS, PROGRAM_CACHE_KEY, PROGRAM_CACHE_DURATION } from './constants.js';
import { updateStudentsProgram } from './students.js';
import { sortArray } from './utils.js';

let programs = [];
let programSort = { column: 0, direction: 'asc' };

export async function loadPrograms(useCache = true) {
  const isAdminPage = window.location.pathname.includes('admin.html');
  if (isAdminPage) showTableSpinner('#programsTable');
  try {
    // Try cache first
    if (useCache) {
      const cached = localStorage.getItem(PROGRAM_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < PROGRAM_CACHE_DURATION) {
          programs = data;
          if (isAdminPage) {
            renderProgramsTable();
            hideTableSpinner('#programsTable');
          }
          return;
        }
      }
    }
    // Fetch from Firestore
    const q = query(collection(db, COLLECTIONS.PROGRAMS), orderBy('programCode'));
    const snapshot = await getDocs(q);
    programs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Update cache
    localStorage.setItem(PROGRAM_CACHE_KEY, JSON.stringify({
      data: programs,
      timestamp: Date.now()
    }));
    if (window.location.pathname.includes('registrationPage.html')) {
      populateProgramDropdown();
    }
    if (isAdminPage) {
      renderProgramsTable();
    }
  } catch (err) {
    showErrorModal(err.code, 'Failed to load programs.');
  } finally {
    if (isAdminPage) hideTableSpinner('#programsTable');
  }
}

export function populateProgramDropdown() {
  const select = document.getElementById('program');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Select Program</option>';
  programs.forEach(p => {
    const option = document.createElement('option');
    option.value = p.programCode;
    option.textContent = `(${p.programCode}) ${p.programName}`;
    select.appendChild(option);
  });
  const others = document.createElement('option');
  others.value = 'Others';
  others.textContent = 'Others';
  select.appendChild(others);
}

function renderProgramsTable() {
  const tbody = document.querySelector('#programsTable tbody');
  if (!tbody) return;
  const sorted = sortPrograms(programs, programSort.column, programSort.direction);
  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td>${p.programCode}</td>
      <td>${p.programName}</td>
      <td class="action-cell">
        <button onclick="editProgram('${p.id}')" class="btn-edit">Edit</button>
        <button onclick="deleteProgram('${p.id}')" class="btn-delete">Delete</button>
      </td>
    </tr>
  `).join('');
  filterProgramsTable();
}

function sortPrograms(programs, columnIndex, direction) {
  const prop = columnIndex === 0 ? 'programCode' : 'programName';
  return sortArray(programs, prop, direction);
}

export function handleProgramSort(columnIndex) {
  if (programSort.column === columnIndex) {
    programSort.direction = programSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    programSort.column = columnIndex;
    programSort.direction = 'asc';
  }
  renderProgramsTable();
  updateProgramSortIndicators();
}

function updateProgramSortIndicators() {
  const headers = document.querySelectorAll('#programsTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  const idx = programSort.column;
  if (headers[idx]) {
    headers[idx].classList.add(programSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

export function showAddProgramModal() {
  document.getElementById('newProgramCode').value = '';
  document.getElementById('newProgramName').value = '';
  showModal('addProgramModal');
}

export function closeAddProgramModal() {
  closeModal('addProgramModal');
}

export async function addProgram() {
  let code = document.getElementById('newProgramCode').value.trim();
  let name = document.getElementById('newProgramName').value.trim();
  if (!code || !name) {
    showMessageModal('Please enter both code and name.');
    return;
  }
  name = formatProgramName(name);
  if (!/^[A-Za-z]+$/.test(code)) {
    showMessageModal('Program code must contain only letters.');
    return;
  }
  code = code.toUpperCase();
  if (programs.some(p => p.programCode.toUpperCase() === code)) {
    showMessageModal(`Program code "${code}" already exists.`);
    return;
  }
  try {
    await addDoc(collection(db, COLLECTIONS.PROGRAMS), { programCode: code, programName: name });
    closeAddProgramModal();
    await loadPrograms(false); // bypass cache
    showMessageModal('Program added successfully.');
  } catch (err) {
    showErrorModal(err.code, 'Error adding program.');
  }
}

export function editProgram(id) {
  const program = programs.find(p => p.id === id);
  if (!program) return;
  document.getElementById('editProgramId').value = id;
  document.getElementById('editProgramCode').value = program.programCode;
  document.getElementById('editProgramName').value = program.programName;
  showModal('editProgramModal');
}

export function closeEditProgramModal() {
  closeModal('editProgramModal');
}

export async function updateProgram() {
  const id = document.getElementById('editProgramId').value;
  const oldProgram = programs.find(p => p.id === id);
  if (!oldProgram) {
    showMessageModal('Program not found.');
    return;
  }
  const oldCode = oldProgram.programCode;
  let code = document.getElementById('editProgramCode').value.trim();
  let name = document.getElementById('editProgramName').value.trim();
  if (!code || !name) {
    showMessageModal('Please enter both code and name.');
    return;
  }
  name = formatProgramName(name);
  if (!/^[A-Za-z]+$/.test(code)) {
    showMessageModal('Program code must contain only letters.');
    return;
  }
  code = code.toUpperCase();
  const duplicate = programs.some(p => p.id !== id && p.programCode.toUpperCase() === code);
  if (duplicate) {
    showMessageModal(`Program code "${code}" already exists.`);
    return;
  }
  try {
    await updateDoc(doc(db, COLLECTIONS.PROGRAMS, id), { programCode: code, programName: name });
    if (oldCode !== code) {
      await updateStudentsProgram(oldCode, code);
    }
    closeEditProgramModal();
    await loadPrograms(false);
    showMessageModal('Program updated successfully.');
  } catch (err) {
    showErrorModal(err.code, 'Error updating program.');
  }
}

let pendingDeleteProgramId = null;
export function deleteProgram(id) {
  const program = programs.find(p => p.id === id);
  if (!program) return;
  // Check if any student uses this program (allStudents is global from students.js, but we'll need to import it or pass as param)
  // For simplicity, we'll import allStudents from students.js (will need to handle circular deps)
  // We'll use a callback pattern – we'll define this after importing students.
  pendingDeleteProgramId = id;
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete program ${program.programCode}?`;
  showModal('confirmModal');
}

export async function confirmProgramDelete() {
  const id = pendingDeleteProgramId;
  closeModal('confirmModal');
  try {
    await deleteDoc(doc(db, COLLECTIONS.PROGRAMS, id));
    await loadPrograms(false);
    showMessageModal('Program deleted.');
  } catch (err) {
    showErrorModal(err.code, 'Error deleting program.');
  } finally {
    pendingDeleteProgramId = null;
  }
}

function formatProgramName(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(^|\s)([a-z])/g, (match, separator, letter) => separator + letter.toUpperCase());
}

export function filterProgramsTable() {
  const search = document.getElementById('programSearch')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#programsTable tbody tr');
  rows.forEach(row => {
    const code = row.cells[0]?.textContent.toLowerCase() || '';
    const name = row.cells[1]?.textContent.toLowerCase() || '';
    row.style.display = (search === '' || code.includes(search) || name.includes(search)) ? '' : 'none';
  });
}

export function clearProgramFilters() {
  document.getElementById('programSearch').value = '';
  filterProgramsTable();
}