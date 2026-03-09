// ==================== GLOBAL VARIABLES ====================
let allStudents = [];
let pendingDeleteRfids = [];
let homeSort = { column: 0, direction: 'asc' };
let registeredSort = { column: 1, direction: 'asc' };

// ==================== PAGE INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  loadStudents();
  attachSortListeners();
  if (document.getElementById('academicYear')) {
    populateAcademicYear();
  }
  if (document.getElementById('date')) {
    setDefaultDate();
  }
  // Enable hover scroll only on registration page
  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
  }
  // Enable hover scroll for dropdowns on status update page
  if (window.location.pathname.includes('statusupdate.html')) {
    enableStatusUpdateHoverScroll();
  }

  // Add Enter key listener for login page
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        login();
      }
    });
  }

  // Add Enter key listener for RFID search on status update page
  if (window.location.pathname.includes('statusupdate.html')) {
    const rfidInput = document.getElementById('rfidSearch');
    if (rfidInput) {
      rfidInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchStudent();
        }
      });
    }
  }

  if (window.location.pathname.includes('statusupdate.html')) {
    enableStatusUpdateHoverScroll();
  }

  // Load dark mode preference
  loadDarkModePreference();

  // Highlight active nav item based on current page
  function setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'home.html';
    const navLinks = document.querySelectorAll('.sidebar .nav');
    navLinks.forEach(link => {
      link.classList.remove('active');
      const onclick = link.getAttribute('onclick') || '';
      if (onclick.includes('goHome') && path === 'home.html') link.classList.add('active');
      if (onclick.includes('goRegister') && path === 'registrationPage.html') link.classList.add('active');
      if (onclick.includes('goStatusUpdate') && path === 'statusupdate.html') link.classList.add('active');
      if (onclick.includes('goRegistered') && path === 'registeredPage.html') link.classList.add('active');
    });
  }

  setActiveNav();
});

// ==================== HOVER SCROLL FOR DROPDOWNS ====================
function enableHoverScroll() {
  const selects = document.querySelectorAll('.registration-layout select');
  selects.forEach(select => {
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

// ==================== HOVER SCROLL FOR STATUS UPDATE DROPDOWNS ====================
function enableStatusUpdateHoverScroll() {
  const selects = document.querySelectorAll('#updateStatus, #updateRemarks');
  selects.forEach(select => {
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

// ==================== DATA FETCHING ====================
async function loadStudents() {
  try {
    const q = query(collection(db, 'students'), orderBy('dateTime', 'desc'));
    const querySnapshot = await getDocs(q);
    allStudents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (document.getElementById('homeTable')) {
      renderHomeTable(allStudents, true);
      updateSortIndicators(homeSort.column, homeSort.direction, false);
    }
    if (document.getElementById('registeredTable')) {
      renderRegisteredTable(allStudents, true);
      updateSortIndicators(registeredSort.column, registeredSort.direction, true);
      handleUrlHighlight();
    }
    applyFilters();
  } catch (err) {
    console.error('Failed to load students:', err);
  }
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
      <td>${student.gender || ''}</td>
      <td>${student.remarks || ''}</td>
      <td>${student.clearanceStatus || 'Pending'}</td>
    </tr>
  `).join('');
  applyFilters();
}

function renderRegisteredTable(students, keepSort = false) {
  const tbody = document.querySelector('#registeredTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortStudents(students, registeredSort.column, registeredSort.direction, true) : students;
  tbody.innerHTML = data.map(student => {
    const displayStatus = student.clearanceStatus || 'Pending';
    const displayRemarks = student.remarks || 'None';
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
        <td>${student.gender || ''}</td>
        <td>
          <select class="remarks-select" data-rfid="${student.rfidNumber}" onchange="updateRemarks('${student.rfidNumber}', this.value)">
            <option value="None" ${displayRemarks === 'None' ? 'selected' : ''}>None</option>
            <option value="Graduating" ${displayRemarks === 'Graduating' ? 'selected' : ''}>Graduating</option>
            <option value="Moving Up" ${displayRemarks === 'Moving Up' ? 'selected' : ''}>Moving Up</option>
            <option value="Transferring" ${displayRemarks === 'Transferring' ? 'selected' : ''}>Transferring</option>
          </select>
        </td>
        <td>
          <select class="status-select" data-rfid="${student.rfidNumber}" onchange="updateClearanceStatus('${student.rfidNumber}', this.value)">
            <option value="Pending" ${displayStatus === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Claimed" ${displayStatus === 'Claimed' ? 'selected' : ''}>Claimed</option>
            <option value="Returned" ${displayStatus === 'Returned' ? 'selected' : ''}>Returned</option>
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
      1: 'rfidNumber',
      2: 'name',
      3: 'program',
      4: 'yearLevel',
      5: 'studentNumber',
      6: 'dateTime',
      7: 'semester',
      8: 'academicYear',
      9: 'gender',
      10: 'remarks',
      11: 'clearanceStatus'
    };
    return map[columnIndex];
  } else {
    const map = {
      0: 'rfidNumber',
      1: 'name',
      2: 'program',
      3: 'yearLevel',
      4: 'studentNumber',
      5: 'dateTime',
      6: 'semester',
      7: 'academicYear',
      8: 'gender',
      9: 'remarks',
      10: 'clearanceStatus'
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
  if (document.getElementById('homeTable')) {
    const homeHeaders = document.querySelectorAll('#homeTable th');
    homeHeaders.forEach((th, index) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
  if (document.getElementById('registeredTable')) {
    const regHeaders = document.querySelectorAll('#registeredTable th');
    regHeaders.forEach((th, index) => {
      if (index === 0) return;
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
    showMessageModal('Please select at least one student to delete.');
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

async function confirmDelete() {
  const rfidsToDelete = [...pendingDeleteRfids];
  closeConfirmModal();
  try {
    const deletePromises = rfidsToDelete.map(rfid => deleteDoc(doc(db, 'students', rfid)));
    await Promise.all(deletePromises);
    loadStudents();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ==================== UPDATE STATUS ====================
async function updateClearanceStatus(rfid, newStatus) {
  try {
    await updateDoc(doc(db, 'students', rfid), { clearanceStatus: newStatus });
    loadStudents();
  } catch (err) {
    console.error('Update failed:', err);
  }
}

// ==================== STATUS UPDATE PAGE FUNCTIONS ====================

async function searchStudent() {
  const rfid = document.getElementById('rfidSearch').value.trim();
  if (!rfid) {
    showMessageModal('Please enter an RFID number.');
    return;
  }
  try {
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const student = docSnap.data();
      displayStudentForUpdate(student);
    } else {
      showMessageModal('No student found with that RFID.');
    }
  } catch (err) {
    console.error('Search error:', err);
    showMessageModal('Error searching for student.');
  }
}

function displayStudentForUpdate(student) {
  const container = document.getElementById('studentResult');
  container.style.display = 'block';
  const currentStatus = student.clearanceStatus || 'Pending';
  const currentRemarks = student.remarks || 'None';

  container.innerHTML = `
    <h3 style="margin-bottom: 20px;">Student Details</h3>
    <table style="width:100%; margin-bottom: 20px;">
      <tr><th>RFID</th><td>${student.rfidNumber || ''}</td></tr>
      <tr><th>Name</th><td>${student.name || ''}</td></tr>
      <tr><th>Program</th><td>${student.program || ''}</td></tr>
      <tr><th>Year Level</th><td>${student.yearLevel || ''}</td></tr>
      <tr><th>Student Number</th><td>${student.studentNumber || ''}</td></tr>
      <tr><th>Date & Time</th><td>${student.dateTime || ''}</td></tr>
      <tr><th>Semester</th><td>${student.semester || ''}</td></tr>
      <tr><th>Academic Year</th><td>${student.academicYear || ''}</td></tr>
      <tr><th>Gender</th><td>${student.gender || ''}</td></tr>
    </table>
    <!-- Dropdowns row -->
    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
      <select id="updateStatus" class="status-select" style="flex:1;">
        <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Claimed" ${currentStatus === 'Claimed' ? 'selected' : ''}>Claimed</option>
        <option value="Returned" ${currentStatus === 'Returned' ? 'selected' : ''}>Returned</option>
      </select>
      <select id="updateRemarks" class="remarks-select" style="flex:1;">
        <option value="None" ${currentRemarks === 'None' ? 'selected' : ''}>None</option>
        <option value="Graduating" ${currentRemarks === 'Graduating' ? 'selected' : ''}>Graduating</option>
        <option value="Moving Up" ${currentRemarks === 'Moving Up' ? 'selected' : ''}>Moving Up</option>
        <option value="Transferring" ${currentRemarks === 'Transferring' ? 'selected' : ''}>Transferring</option>
      </select>
    </div>
    <!-- Update button row -->
    <div style="text-align: center;">
      <button onclick="updateStudent('${student.rfidNumber}')" class="export-btn" style="width: 200px;">Update</button>
    </div>
  `;
}

async function updateStudent(rfid) {
  const newStatus = document.getElementById('updateStatus').value;
  const newRemarks = document.getElementById('updateRemarks').value;
  try {
    await updateDoc(doc(db, 'students', rfid), {
      clearanceStatus: newStatus,
      remarks: newRemarks
    });
    showMessageModal('Student updated successfully.');
  } catch (err) {
    console.error('Update error:', err);
    showMessageModal('Update failed: ' + err.message);
  }
}

// ==================== UPDATE REMARKS ====================
async function updateRemarks(rfid, newRemarks) {
  try {
    await updateDoc(doc(db, 'students', rfid), { remarks: newRemarks });
    loadStudents();
  } catch (err) {
    console.error('Remarks update failed:', err);
  }
}

// ==================== MESSAGE MODAL ====================
function showMessageModal(text) {
  document.getElementById('messageModalText').innerText = text;
  document.getElementById('messageModal').style.display = 'flex';
}

function closeMessageModal() {
  document.getElementById('messageModal').style.display = 'none';
}

// ==================== ERROR MODAL ====================
function closeErrorModal() {
  document.getElementById('errorModal').style.display = 'none';
}

// ==================== TOGGLE PASSWORD ====================
function togglePassword() {
  const passwordInput = document.getElementById('password');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
  } else {
    passwordInput.type = 'password';
  }
}

// ==================== DARK MODE ====================
function toggleDarkMode() {
  const body = document.body;
  body.classList.toggle('dark-mode');
  const icon = document.getElementById('darkModeIcon');
  if (icon) {
    icon.textContent = body.classList.contains('dark-mode') ? '☼' : '☾';
  }
  localStorage.setItem('darkMode', body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
}

function loadDarkModePreference() {
  const darkMode = localStorage.getItem('darkMode');
  const icon = document.getElementById('darkModeIcon');
  if (darkMode === 'enabled') {
    document.body.classList.add('dark-mode');
    if (icon) icon.textContent = '☼';
  } else {
    if (icon) icon.textContent = '☾';
  }
}

// ==================== SET DEFAULT DATE ====================
function setDefaultDate() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
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
    status: document.getElementById('status').value,
    gender: document.getElementById('gender').value,
    remarks: document.getElementById('remarks').value
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
  if (!formData.gender) { showFieldError('gender'); hasErrors = true; }
  if (hasErrors) return;

  registerStudent(formData);
}

async function registerStudent(formData) {
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
    name: formData.name,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    dateTime: dateTime,
    semester: formData.semester,
    academicYear: formData.academicYear,
    gender: formData.gender,
    remarks: formData.remarks || '',
    clearanceStatus: formData.status
  };

  try {
    await setDoc(doc(db, 'students', formData.rfidNumber), student);
    resetRegistrationForm();
    document.getElementById('successModal').style.display = 'flex';
  } catch (err) {
    if (err.code === 'permission-denied') {
      alert('Permission denied. Check Firestore security rules.');
    } else if (err.code === 'already-exists') {
      alert('RFID number already exists.');
    } else {
      alert('Registration failed: ' + err.message);
    }
  }
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
  const gender = document.getElementById('gender');
  if (gender) gender.selectedIndex = 0;
  const remarks = document.getElementById('remarks');
  if (remarks) remarks.selectedIndex = 0;
  clearAllFieldErrors();
  setDefaultDate();
}

// ==================== ACADEMIC YEAR DROPDOWN ====================
function populateAcademicYear() {
  const select = document.getElementById('academicYear');
  if (!select) return;
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 5;
  let options = '<option value="" disabled selected>Select Academic Year</option>';
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
  const isRegistered = window.location.pathname.includes('registeredPage.html');
  const tableId = isRegistered ? '#registeredTable' : '#homeTable';
  const table = document.querySelector(tableId);
  if (!table) return;

  const searchInput = document.getElementById('search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }
    if (statusFilter && show) {
      if (isRegistered) {
        const statusCell = row.cells[11];
        if (statusCell) {
          const select = statusCell.querySelector('select');
          if (select && select.value !== statusFilter) show = false;
        }
      } else {
        const statusCell = row.cells[10];
        if (statusCell && statusCell.innerText.trim() !== statusFilter) show = false;
      }
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
function showExportModal() { document.getElementById('exportModal').style.display = 'flex'; }
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }
function exportChosen(type) { closeExportModal(); exportData(type); }

// ==================== LOGIN ====================
async function login() {
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (email === '' || password === '') {
    showMessageModal('Please enter email and password');
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'home.html';
  } catch (err) {
    if (err.code === 'auth/invalid-credential') {
      document.getElementById('errorModal').style.display = 'flex';
    } else {
      console.error('Login error:', err);
    }
  }
}

// ==================== LOGOUT ====================
function logout() {
  showLogoutModal();
}

async function confirmLogout() {
  closeLogoutModal();
  try {
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ==================== MOBILE MENU ====================
function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.menu-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
  }
}

function closeMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.menu-overlay');
  if (sidebar && overlay) {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  }
}

// ==================== NAVIGATION ====================
function needHelp() { showHelpModal(); }
function goHome() { window.location.href = 'home.html'; }
function goRegister() { window.location.href = 'registrationPage.html'; }
function goStatusUpdate() { window.location.href = 'statusupdate.html'; }
function goRegistered() { window.location.href = 'registeredPage.html'; }
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
    const wb = XLSX.utils.book_new();
    const rows = [];
    const headerRow = [];
    const thead = clone.querySelector('thead tr');
    if (thead) {
      const cells = thead.querySelectorAll('th');
      cells.forEach(th => headerRow.push(th.innerText.trim()));
      rows.push(headerRow);
    }

    const tbodyRows = clone.querySelectorAll('tbody tr');
    tbodyRows.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll('td');
      cells.forEach(td => row.push(td.innerText.trim()));
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Apply centered alignment to all cells
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
          alignment: {
            horizontal: 'center',
            vertical: 'center'
          }
        };
      }
    }

    // Auto-size columns
    const colWidths = [];
    if (headerRow.length) {
      headerRow.forEach((h, i) => {
        let maxLen = h.length;
        rows.slice(1).forEach(r => {
          if (r[i] && r[i].length > maxLen) maxLen = r[i].length;
        });
        colWidths.push({ wch: maxLen + 2 });
      });
      ws['!cols'] = colWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, isRegistered ? 'registered_students.xlsx' : 'students.xlsx');
  } else if (type === 'pdf') {
    window.print();
  }
}