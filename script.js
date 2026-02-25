// ==================== STORAGE HELPERS ====================
const STORAGE_KEY = 'clearanceStudents';

function getStudents() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveStudents(students) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

function addStudent(student) {
  const students = getStudents();
  students.push(student);
  saveStudents(students);
}

// ==================== PAGE RENDERING ====================
document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;

  if (path.includes('home.html')) {
    renderHomeTable();
  } else if (path.includes('registeredPage.html')) {
    renderRegisteredTable();
    handleUrlHighlight();   // <-- add this line
  } else if (path.includes('registrationPage.html')) {
    populateAcademicYear();
  }
});

// ==================== GLOBAL VARIABLES FOR MODALS ====================
let pendingDeleteRfids = [];   // Store RFID(s) to delete when confirmed

// ==================== DELETE CONFIRMATION MODAL ====================
function deleteSelected() {
  const selectedCheckboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert('Please select at least one student to delete.');
    return;
  }

  // Store the RFID numbers of selected students
  pendingDeleteRfids = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-rfid'));

  // Show the confirmation modal
  const modal = document.getElementById('confirmModal');
  const message = `Are you sure you want to delete ${selectedCheckboxes.length} selected student(s)?`;
  document.getElementById('confirmMessage').textContent = message;
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
}

function confirmDelete() {
  const rfidsToDelete = [...pendingDeleteRfids]; // copy before clearing
  closeConfirmModal(); // this clears pendingDeleteRfids

  // Perform deletion using the copied list
  let students = getStudents();
  students = students.filter(s => !rfidsToDelete.includes(s.rfidNumber));
  saveStudents(students);

  // Re-render tables
  if (document.querySelector('#registeredTable')) renderRegisteredTable();
  if (document.querySelector('#homeTable')) renderHomeTable();
}

// ==================== HELP MODAL ====================
function showHelpModal() {
  document.getElementById('helpModal').style.display = 'flex';
}

function closeHelpModal() {
  document.getElementById('helpModal').style.display = 'none';
}

// ==================== LOGOUT CONFIRMATION MODAL ====================
function showLogoutModal() {
  document.getElementById('logoutModal').style.display = 'flex';
}

function closeLogoutModal() {
  document.getElementById('logoutModal').style.display = 'none';
}

function confirmLogout() {
  closeLogoutModal();
  window.location.href = 'login.html';
}

// ==================== EXPORT MODAL ====================
function showExportModal() {
  document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
  document.getElementById('exportModal').style.display = 'none';
}

function exportChosen(type) {
  closeExportModal();
  exportData(type);
}

// ==================== REGISTRATION SUCCESS MODAL ====================
function registerStudent(formData) {
  const dateObj = new Date(formData.date + 'T00:00:00');
  const now = new Date();
  dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const dateTime = dateObj.toLocaleString();

  const student = {
    rfidNumber: formData.rfidNumber,
    name: formData.name,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    dateTime: dateTime,
    semester: formData.semester,
    academicYear: formData.academicYear,
    clearanceStatus: ''
  };

  addStudent(student);

  // Show success modal instead of alert
  document.getElementById('successModal').style.display = 'flex';
}

function closeSuccessModalAndRedirect() {
  document.getElementById('successModal').style.display = 'none';
  window.location.href = 'home.html';
}

// Render table on home.html (status as text)
function renderHomeTable() {
  const tbody = document.querySelector('#homeTable tbody');
  if (!tbody) return;
  const students = getStudents();
  tbody.innerHTML = students.map(student => `
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
}

// Update the state of the "select all" checkbox based on individual checkboxes
function updateSelectAllState() {
  const selectAll = document.getElementById('selectAll');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  selectAll.checked = allChecked;
}

// Toggle all checkboxes (existing, but now calls updateSelectAllState)
function toggleSelectAll(selectAllCheckbox) {
  const checkboxes = document.querySelectorAll('#registeredTable tbody .student-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateSelectAllState(); // Ensure consistency
}

// Modified renderRegisteredTable (add onchange to each checkbox)
function renderRegisteredTable() {
  const tbody = document.querySelector('#registeredTable tbody');
  if (!tbody) return;
  const students = getStudents();
  tbody.innerHTML = students.map(student => {
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
  
  // Uncheck select all after re-render
  const selectAll = document.getElementById('selectAll');
  if (selectAll) selectAll.checked = false;
}

// Update clearance status for a student
function updateClearanceStatus(rfid, newStatus) {
  const students = getStudents();
  const student = students.find(s => s.rfidNumber === rfid);
  if (student) {
    student.clearanceStatus = newStatus;
    saveStudents(students);
    renderRegisteredTable(); // Refresh the table to reflect change
  }
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
    academicYear: document.getElementById('academicYear').value
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
  document.querySelectorAll('.registration-layout input, .registration-layout select').forEach(field => {
    field.classList.remove('error-field');
  });
}

function clearFieldError(fieldId) {
  document.getElementById(fieldId).classList.remove('error-field');
}

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
    showModal();
  }
}

function showModal() {
  document.getElementById('errorModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('errorModal').style.display = 'none';
}

// ==================== NAVIGATION ====================
function needHelp() {
  showHelpModal();
}

function goHome() {
  window.location.href = 'home.html';
}

function goRegister() {
  window.location.href = 'registrationPage.html';
}

function goRegistered() {
  window.location.href = 'registeredPage.html';
}

function logout() {
  showLogoutModal();
}

function goToRegistered(rfid) {
  window.location.href = 'registeredPage.html?rfid=' + encodeURIComponent(rfid);
}

// ==================== IMAGE UPLOAD ====================
function loadImage(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const profileImage = document.getElementById('profileImage');
      profileImage.style.backgroundImage = `url('${e.target.result}')`;
      profileImage.style.backgroundSize = 'cover';
      profileImage.style.backgroundPosition = 'center';
    };
    reader.readAsDataURL(file);
  }
}

// ==================== SEARCH & EXPORT ====================
// ==================== FILTERING ====================
function applyFilters() {
  const searchInput = document.getElementById('search').value.toLowerCase();
  const statusFilter = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : '';
  
  const isRegistered = window.location.pathname.includes('registeredPage.html');
  const tableId = isRegistered ? '#registeredTable' : '#homeTable';
  const rows = document.querySelectorAll(`${tableId} tbody tr`);
  
  rows.forEach(row => {
    let show = true;
    
    // Search filter (check entire row text)
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }
    
    // Status filter
    if (statusFilter && show) {
      // Status column index: registered = 9 (after checkbox), home = 8
      const statusCellIndex = isRegistered ? 9 : 8;
      const statusCell = row.cells[statusCellIndex];
      if (statusCell) {
        const statusText = statusCell.innerText.trim();
        if (statusText !== statusFilter) {
          show = false;
        }
      }
    }
    
    row.style.display = show ? '' : 'none';
  });
  
  // Update select all state on registered page
  if (isRegistered) {
    updateSelectAllState();
  }
}

function clearFilters() {
  document.getElementById('search').value = '';
  if (document.getElementById('statusFilter')) {
    document.getElementById('statusFilter').value = '';
  }
  applyFilters();
}

// Remove old searchTable function – we no longer need it.
// But keep it if referenced elsewhere; we can redirect:
function searchTable() {
  applyFilters();
}

function exportData(type) {
  if (!type) return;

  const isRegistered = window.location.pathname.includes('registeredPage.html');
  const table = document.getElementById(isRegistered ? 'registeredTable' : 'homeTable');
  if (!table) return;

  // Clone the table
  const clone = table.cloneNode(true);

  // Remove rows that are hidden in the original table
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  // Iterate backwards to avoid index issues
  for (let i = clonedTBody.rows.length - 1; i >= 0; i--) {
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }

  // If registered, remove the first column (checkbox)
  if (isRegistered) {
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) {
      headerRow.deleteCell(0);
    }
    const rows = clone.querySelectorAll('tbody tr');
    rows.forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0);
      }
    });
  }

  // Export
  if (type === 'excel') {
    const tableHTML = clone.outerHTML.replace(/ /g, '%20');
    const a = document.createElement('a');
    a.href = 'data:application/vnd.ms-excel,' + tableHTML;
    a.download = isRegistered ? 'registered_students.xls' : 'students.xls';
    a.click();
  } else if (type === 'pdf') {
    window.print(); // Print CSS hides UI and checkbox column
  }
}