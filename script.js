// ==================== API BASE URL ====================
const API_BASE = 'http://localhost:8000'; // adjust if server is on a different host/port

// ==================== GLOBAL VARIABLES ====================
let allStudents = [];               // stores the current list from server
let pendingDeleteRfids = [];         // for delete modal
let homeSort = { column: 0, direction: 'asc' };
let registeredSort = { column: 1, direction: 'asc' };

// ==================== PAGE INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  // Load data once – this will update any table that exists on the current page
  loadStudents();

  // Attach sort listeners to existing tables (only once)
  attachSortListeners();

  // Academic year dropdown (registration page)
  if (document.getElementById('academicYear')) {
    populateAcademicYear();
  }
});

// ==================== DATA FETCHING ====================
function loadStudents() {
  fetch(`${API_BASE}/api/students.php`)
    .then(res => res.json())
    .then(students => {
      allStudents = students; // store globally for filters & sorting

      // Home page
      if (document.getElementById('homeTable')) {
        renderHomeTable(students, true);
        updateSortIndicators(homeSort.column, homeSort.direction, false);
      }

      // Registered page
      if (document.getElementById('registeredTable')) {
        renderRegisteredTable(students, true);
        updateSortIndicators(registeredSort.column, registeredSort.direction, true);
        handleUrlHighlight();   // after rendering
      }
    })
    .catch(err => console.error('Failed to load students:', err));
}

// ==================== RENDERING ====================
function renderHomeTable(students, keepSort = false) {
  const tbody = document.querySelector('#homeTable tbody');
  if (!tbody) return;

  let data = keepSort ? sortStudents(students, homeSort.column, homeSort.direction, false) : students;

  tbody.innerHTML = data.map(student => `
    <tr ondblclick="goToRegistered('${student.rfidNumber}')">
      <td>${student.rfidNumber || ''}</td>
      <td>${student.name || ''}</td>
      <td>${student.program || ''}</td>
      <td>${student.yearLevel || ''}</td>
      <td>${student.studentNumber || ''}</td>
      <td>${student.dateTime || ''}</td>
      <td>${student.semester || ''}</td>
      <td>${student.academicYear || ''}</td>
      <td>${student.clearanceStatus || 'Pending'}</td>
    </tr>
  `).join('');

  applyFilters(); // re‑apply any active filters
}

function renderRegisteredTable(students, keepSort = false) {
  const tbody = document.querySelector('#registeredTable tbody');
  if (!tbody) return;

  let data = keepSort ? sortStudents(students, registeredSort.column, registeredSort.direction, true) : students;

  tbody.innerHTML = data.map(student => {
    const status = student.clearanceStatus || '';
    return `
      <tr>
        <td style="width: 30px; text-align: center;">
          <input type="checkbox" class="student-checkbox" data-rfid="${student.rfidNumber}" onchange="updateSelectAllState()">
        </td>
        <td>${student.rfidNumber || ''}</td>
        <td>${student.name || ''}</td>
        <td>${student.program || ''}</td>
        <td>${student.yearLevel || ''}</td>
        <td>${student.studentNumber || ''}</td>
        <td>${student.dateTime || ''}</td>
        <td>${student.semester || ''}</td>
        <td>${student.academicYear || ''}</td>
        <td>
          <select class="status-select" data-rfid="${student.rfidNumber}" onchange="updateClearanceStatus('${student.rfidNumber}', this.value)">
            <option value="" ${status === '' ? 'selected' : ''}>Pending</option>
            <option value="Claimed" ${status === 'Claimed' ? 'selected' : ''}>Claimed</option>
            <option value="Returned" ${status === 'Returned' ? 'selected' : ''}>Returned</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  const selectAll = document.getElementById('selectAll');
  if (selectAll) selectAll.checked = false;
  applyFilters();
}

// ==================== SORTING ====================
function getSortProperty(columnIndex, isRegistered) {
  if (isRegistered) {
    const map = {
      1: 'rfidNumber', 2: 'name', 3: 'program', 4: 'yearLevel',
      5: 'studentNumber', 6: 'dateTime', 7: 'semester', 8: 'academicYear', 9: 'clearanceStatus'
    };
    return map[columnIndex];
  } else {
    const map = {
      0: 'rfidNumber', 1: 'name', 2: 'program', 3: 'yearLevel',
      4: 'studentNumber', 5: 'dateTime', 6: 'semester', 7: 'academicYear', 8: 'clearanceStatus'
    };
    return map[columnIndex];
  }
}

function sortStudents(students, columnIndex, direction, isRegistered) {
  const prop = getSortProperty(columnIndex, isRegistered);
  if (!prop) return students;
  return [...students].sort((a, b) => {
    let valA = a[prop] || '';
    let valB = b[prop] || '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortIndicators(columnIndex, direction, isRegistered) {
  const tableId = isRegistered ? '#registeredTable' : '#homeTable';
  const headers = document.querySelectorAll(`${tableId} th`);
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  if (headers[columnIndex]) {
    headers[columnIndex].classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function handleSort(columnIndex) {
  const isRegistered = window.location.pathname.includes('registeredPage.html');
  let sort = isRegistered ? registeredSort : homeSort;

  if (sort.column === columnIndex) {
    sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sort.column = columnIndex;
    sort.direction = 'asc';
  }

  if (isRegistered) {
    registeredSort = sort;
    renderRegisteredTable(allStudents, true);
  } else {
    homeSort = sort;
    renderHomeTable(allStudents, true);
  }
  updateSortIndicators(columnIndex, sort.direction, isRegistered);
}

function attachSortListeners() {
  // Home table headers
  if (document.getElementById('homeTable')) {
    const homeHeaders = document.querySelectorAll('#homeTable th');
    homeHeaders.forEach((th, index) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
  // Registered table headers (skip first checkbox column)
  if (document.getElementById('registeredTable')) {
    const regHeaders = document.querySelectorAll('#registeredTable th');
    regHeaders.forEach((th, index) => {
      if (index === 0) return; // skip checkbox
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
}

// ==================== HIGHLIGHT FROM URL ====================
function handleUrlHighlight() {
  const urlParams = new URLSearchParams(window.location.search);
  const rfid = urlParams.get('rfid');
  if (!rfid) return;
  setTimeout(() => {
    const checkbox = document.querySelector(`#registeredTable tbody .student-checkbox[data-rfid="${rfid}"]`);
    if (checkbox) {
      checkbox.checked = true;
      updateSelectAllState();
      const row = checkbox.closest('tr');
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.backgroundColor = '#ffffcc';
        setTimeout(() => row.style.backgroundColor = '', 2000);
      }
    }
  }, 100);
}

// ==================== DELETE ====================
function deleteSelected() {
  const selectedCheckboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert('Please select at least one student to delete.');
    return;
  }
  pendingDeleteRfids = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-rfid'));
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selectedCheckboxes.length} selected student(s)?`;
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
}

function confirmDelete() {
  const rfidsToDelete = [...pendingDeleteRfids];
  closeConfirmModal();
  fetch(`${API_BASE}/api/delete_students.php`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rfids: rfidsToDelete })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      loadStudents(); // refresh both tables (only the one that exists will update)
    } else {
      alert('Delete failed: ' + data.error);
    }
  })
  .catch(err => alert('Network error: ' + err.message));
}

// ==================== UPDATE STATUS ====================
function updateClearanceStatus(rfid, newStatus) {
  fetch(`${API_BASE}/api/update_status.php?rfid=${rfid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      loadStudents(); // refresh registered table (and home if open)
    }
  })
  .catch(err => console.error('Update failed:', err));
}

// ==================== REGISTRATION ====================
function validateAndRegister() {
  clearAllFieldErrors();

  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    name: document.getElementById('name').value.trim(),
    program: document.getElementById('program').value,
    yearLevel: document.getElementById('yearLevel').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
    date: document.getElementById('date').value.trim(),
    semester: document.getElementById('semester').value,
    academicYear: document.getElementById('academicYear').value,
    status: document.getElementById('status').value
  };

  let hasErrors = false;
  if (!formData.rfidNumber) { showFieldError('rfidNumber'); hasErrors = true; }
  if (!formData.name) { showFieldError('name'); hasErrors = true; }
  if (!formData.program) { showFieldError('program'); hasErrors = true; }
  if (!formData.yearLevel) { showFieldError('yearLevel'); hasErrors = true; }
  if (!formData.studentNumber) { showFieldError('studentNumber'); hasErrors = true; }
  if (!formData.date) { showFieldError('date'); hasErrors = true; }
  if (!formData.semester) { showFieldError('semester'); hasErrors = true; }
  if (!formData.academicYear) { showFieldError('academicYear'); hasErrors = true; }
  if (hasErrors) return;

  registerStudent(formData);
}

function registerStudent(formData) {
  const dateObj = new Date(formData.date + 'T00:00:00');
  const now = new Date();
  dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const dateTime = dateObj.toLocaleString(); // adjust format if needed

  const student = {
    rfidNumber: formData.rfidNumber,
    name: formData.name,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    dateTime: dateTime,
    semester: formData.semester,
    academicYear: formData.academicYear,
    clearanceStatus: formData.status
  };

  fetch(`${API_BASE}/api/register.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(student)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      resetRegistrationForm();
      document.getElementById('successModal').style.display = 'flex';
    } else {
      alert('Registration failed: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => alert('Network error: ' + err.message));
}

function closeSuccessModal() {
  document.getElementById('successModal').style.display = 'none';
}

function resetRegistrationForm() {
  document.getElementById('rfidNumber').value = '';
  document.getElementById('name').value = '';
  document.getElementById('studentNumber').value = '';
  document.getElementById('date').value = '';
  const program = document.getElementById('program');
  if (program) program.selectedIndex = 0;
  const year = document.getElementById('yearLevel');
  if (year) year.selectedIndex = 0;
  const sem = document.getElementById('semester');
  if (sem) sem.selectedIndex = 0;
  const acad = document.getElementById('academicYear');
  if (acad) acad.selectedIndex = 0;
  const status = document.getElementById('status');
  if (status) status.selectedIndex = 0;
  clearAllFieldErrors();
}

// ==================== ACADEMIC YEAR DROPDOWN ====================
function populateAcademicYear() {
  const select = document.getElementById('academicYear');
  if (!select) return;
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 5;
  let options = '<option value="" disabled>Select Academic Year</option>';
  for (let year = startYear; year <= endYear; year++) {
    const academicYear = `${year}-${year + 1}`;
    const selected = (year === currentYear) ? 'selected' : '';
    options += `<option value="${academicYear}" ${selected}>${academicYear}</option>`;
  }
  select.innerHTML = options;
}

// ==================== FIELD VALIDATION ====================
function showFieldError(fieldId) {
  document.getElementById(fieldId).classList.add('error-field');
}
function clearAllFieldErrors() {
  document.querySelectorAll('.registration-layout input, .registration-layout select').forEach(f => f.classList.remove('error-field'));
}
function clearFieldError(fieldId) {
  document.getElementById(fieldId).classList.remove('error-field');
}

// ==================== FILTERING ====================
function applyFilters() {
  const searchInput = document.getElementById('search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  const isRegistered = window.location.pathname.includes('registeredPage.html');
  const tableId = isRegistered ? '#registeredTable' : '#homeTable';
  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) show = false;
    if (statusFilter && show) {
      const statusCellIndex = isRegistered ? 9 : 8;
      const statusCell = row.cells[statusCellIndex];
      if (statusCell && statusCell.innerText.trim() !== statusFilter) show = false;
    }
    row.style.display = show ? '' : 'none';
  });

  if (isRegistered) updateSelectAllState();
}

function clearFilters() {
  document.getElementById('search').value = '';
  const filter = document.getElementById('statusFilter');
  if (filter) filter.value = '';
  applyFilters();
}

// ==================== SELECT ALL ====================
function updateSelectAllState() {
  const selectAll = document.getElementById('selectAll');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox');
  selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}
function toggleSelectAll(selectAllCheckbox) {
  const checkboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateSelectAllState();
}

// ==================== MODALS ====================
function showHelpModal() { document.getElementById('helpModal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('helpModal').style.display = 'none'; }
function showLogoutModal() { document.getElementById('logoutModal').style.display = 'flex'; }
function closeLogoutModal() { document.getElementById('logoutModal').style.display = 'none'; }
function confirmLogout() { closeLogoutModal(); window.location.href = 'login.html'; }
function showExportModal() { document.getElementById('exportModal').style.display = 'flex'; }
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }
function exportChosen(type) { closeExportModal(); exportData(type); }

// ==================== LOGIN ====================
function togglePassword() {
  const pass = document.getElementById('password');
  pass.type = pass.type === 'password' ? 'text' : 'password';
}
function login() {
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value.trim();
  if (user === '' || pass === '') {
    alert('Please enter username and password');
    return;
  }
  if (user === 'admin' && pass === 'admin1') {
    window.location.href = 'home.html';
  } else {
    document.getElementById('errorModal').style.display = 'flex';
  }
}
function closeModal() { document.getElementById('errorModal').style.display = 'none'; }

// ==================== NAVIGATION ====================
function needHelp() { showHelpModal(); }
function goHome() { window.location.href = 'home.html'; }
function goRegister() { window.location.href = 'registrationPage.html'; }
function goRegistered() { window.location.href = 'registeredPage.html'; }
function logout() { showLogoutModal(); }
function goToRegistered(rfid) { window.location.href = 'registeredPage.html?rfid=' + encodeURIComponent(rfid); }

// ==================== EXPORT ====================
function exportData(type) {
  if (!type) return;
  const isRegistered = window.location.pathname.includes('registeredPage.html');
  const table = document.getElementById(isRegistered ? 'registeredTable' : 'homeTable');
  if (!table) return;

  const clone = table.cloneNode(true);
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  for (let i = clonedTBody.rows.length - 1; i >= 0; i--) {
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }

  if (isRegistered) {
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) headerRow.deleteCell(0);
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) row.deleteCell(0);
    });
  }

  if (type === 'excel') {
    const tableHTML = clone.outerHTML.replace(/ /g, '%20');
    const a = document.createElement('a');
    a.href = 'data:application/vnd.ms-excel,' + tableHTML;
    a.download = isRegistered ? 'registered_students.xls' : 'students.xls';
    a.click();
  } else if (type === 'pdf') {
    window.print();
  }
}