// ==================== GLOBAL VARIABLES ====================
let allStudents = [];
let clearanceLogs = [];
let programs = [];
let pendingDeleteRfids = [];
let homeSort = { column: 3, direction: 'asc' };
let logSort = { column: 2, direction: 'asc' };
let isEditMode = false;
let currentStudentForUpdate = null;
let isProcessing = false;
let pendingAdminDelete = [];
let adminStudentSort = { column: 1, direction: 'asc' };
let programSort = { column: 0, direction: 'asc' };
let pendingDeleteProgramId = null;
let users = [];
let filteredUsers = [];
let pendingUserAction = null;
let userSort = { column: 0, direction: 'asc' };
let pendingDeleteLogIds = [];

const DEFAULT_PASSWORD = 'Password123!';

// ==================== GLOBAL ENTER KEY HANDLER ====================
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const visibleModal = Array.from(document.querySelectorAll('.modal')).find(modal => 
      window.getComputedStyle(modal).display === 'flex'
    );
    if (visibleModal) {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA' || active.tagName === 'BUTTON');
      if (!isInput) {
        const firstButton = visibleModal.querySelector('button');
        if (firstButton) {
          e.preventDefault();
          firstButton.click();
        }
      }
    }
  }
});

let currentUserRole = null;

async function getUserRole(user) {
  if (!user) return null;
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      return userDoc.data().role;
    }
  } catch (err) {
    console.error('Error fetching user role:', err);
  }
  return null;
}

async function checkPageAccess(allowedRoles) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      const role = await getUserRole(user);
      if (!role || !allowedRoles.includes(role)) {
        if (role === 'user') {
          window.location.href = 'registrationPage.html';
        } else if (role === 'admin') {
          window.location.href = 'home.html';
        } else if (role === 'superadmin') {
          window.location.href = 'superadmin.html';
        } else {
          window.location.href = 'index.html';
        }
        return;
      }
      currentUserRole = role;
      document.body.classList.add(`role-${role}`);
      updateSidebarForRole(role);
      updateTopBarForRole(user);
      resolve(role);
    });
  });
}

function getPhilippinesDateTimeString() {
  const now = new Date();
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = phTime.getUTCFullYear();
  const month = String(phTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(phTime.getUTCDate()).padStart(2, '0');
  const hours = String(phTime.getUTCHours()).padStart(2, '0');
  const minutes = String(phTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(phTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function updateSidebarForRole(role) {
  const navItems = document.querySelectorAll('.sidebar .nav');
  if (role === 'user') {
    navItems.forEach(item => {
      const onclick = item.getAttribute('onclick') || '';
      if (!onclick.includes('goRegister()')) {
        item.style.display = 'none';
      }
    });
  } else {
    navItems.forEach(item => item.style.display = 'flex');
  }
}

async function isStudentNumberDuplicate(studentNumber, excludeRfid = null) {
  const q = query(collection(db, 'students'), where('studentNumber', '==', studentNumber));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return false;
  if (excludeRfid) {
    return snapshot.docs.some(doc => doc.id !== excludeRfid);
  }
  return true;
}

async function updateStudentsProgram(oldCode, newCode) {
  try {
    const q = query(collection(db, 'students'), where('program', '==', oldCode));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { program: newCode });
    });
    await batch.commit();
    console.log(`Updated ${snapshot.size} students from ${oldCode} to ${newCode}`);
  } catch (err) {
    console.error('Error updating students program:', err);
    showMessageModal('Failed to update students using this program: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname.includes('home.html') || 
      window.location.pathname.includes('admin.html')) {
    loadStudents();
  }
  auth.onAuthStateChanged((user) => {
    updateTopBarForRole(user);
  });
  if (window.location.pathname.includes('clearanceTracking.html')) {
    loadClearanceLogs();
  }
  if (window.location.pathname.includes('registrationPage.html') || 
      window.location.pathname.includes('admin.html')) {
    loadPrograms();
  }
  attachSortListeners();
  if (document.getElementById('date')) setDefaultDate();
  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
    populateProgramDropdown(); 
  }
  if (window.location.pathname.includes('statusupdate.html')) {
    enableStatusUpdateHoverScroll();
  }
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); login(); }
    });
  }
  if (window.location.pathname.includes('statusupdate.html')) {
    const rfidInput = document.getElementById('rfidSearch');
    if (rfidInput) {
      rfidInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); searchStudent(); }
      });
    }
  }
  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
    populateProgramDropdown();
    populateAcademicYearDropdown();
  }
  loadDarkModePreference();
  function setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'home.html';
    const navLinks = document.querySelectorAll('.sidebar .nav');
    navLinks.forEach(link => {
      link.classList.remove('active');
      const onclick = link.getAttribute('onclick') || '';
      if (onclick.includes('goHome()') && path === 'home.html') link.classList.add('active');
      if (onclick.includes('goRegister()') && path === 'registrationPage.html') link.classList.add('active');
      if (onclick.includes('goStatusUpdate()') && path === 'statusupdate.html') link.classList.add('active');
      if (onclick.includes('goAdmin()') && path === 'admin.html') link.classList.add('active');
      if (onclick.includes('goRegistered()') && path === 'clearanceTracking.html') link.classList.add('active');
    });
  }
  setActiveNav();
  if (window.location.pathname.includes('registrationPage.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const rfid = urlParams.get('rfid');
    if (rfid) {
      setupEditMode(rfid);
    } else {
      resetRegistrationForm();
    }
    let tamperInterval = setInterval(checkFieldIntegrity, 2000);
    function checkFieldIntegrity() {
      const fieldsToCheck = [
        'surname', 'firstName', 'middleName',
        'program', 'yearLevel', 'gender'
      ];
      for (let id of fieldsToCheck) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dataField = el.getAttribute('data-field');
        if (!dataField || dataField !== id) {
          triggerTamperAlert();
          return;
        }
      }
      const regBtn = document.getElementById('registerButton');
      if (regBtn && regBtn.getAttribute('onclick') !== 'validateAndRegister()' &&
                     regBtn.getAttribute('onclick') !== 'validateAndUpdate()') {
        triggerTamperAlert();
      }
    }
    if (rfid) {
      document.querySelectorAll('input[name="regType"]').forEach(radio => radio.disabled = true);
      document.getElementById('newStudentFields').style.display = 'block';
    }
    function triggerTamperAlert() {
      clearInterval(tamperInterval);
      showMessageModal('I know what you did there blud...');
      document.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }
    window.addEventListener('beforeunload', function() {
      clearInterval(tamperInterval);
    });
  }
  document.addEventListener('click', function(e) {
    const th = e.target.closest('th');
    if (!th) return;
    const table = th.closest('table');
    if (!table) return;
    if (table.id === 'adminStudentsTable') {
      const index = Array.from(th.parentNode.children).indexOf(th);
      if (index >= 0 && index <= 6) {
        handleAdminSort(index);
      }
    } else if (table.id === 'programsTable') {
      const index = Array.from(th.parentNode.children).indexOf(th);
      if (index === 0 || index === 1) {
        handleProgramSort(index);
      }
    }
  });
});

function showTableSpinner(tableId) {
  const table = document.querySelector(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const spinnerRow = document.createElement('tr');
  spinnerRow.id = 'loading-spinner-row';
  spinnerRow.innerHTML = `<td colspan="100" style="text-align: center;"><div class="loading-spinner" style="display: inline-block;"></div></td>`;
  tbody.innerHTML = '';
  tbody.appendChild(spinnerRow);
}

function hideTableSpinner(tableId) {
  const table = document.querySelector(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const spinnerRow = document.getElementById('loading-spinner-row');
  if (spinnerRow) spinnerRow.remove();
}

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

function enableStatusUpdateHoverScroll() {
  const selects = document.querySelectorAll('#updateRemarks, #updateAcadYear, #updateSemester');
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

async function loadStudents() {
  if (document.getElementById('homeTable')) showTableSpinner('#homeTable');
  try {
    const q = query(collection(db, 'students'), orderBy('dateTime', 'desc'));
    const querySnapshot = await getDocs(q);
    allStudents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (document.getElementById('homeTable')) {
      renderHomeTable(allStudents, true);
      populateStudentFilters();
      updateSortIndicators(homeSort.column, homeSort.direction, false);
      populateCourseFilter();
    }
    if (document.getElementById('adminStudentsTable')) {
      renderAdminStudentsTable();
    }
  } catch (err) {
    console.error('Failed to load students:', err);
    showMessageModal('Failed to load students: ' + err.message);
  } finally {
    hideTableSpinner('#homeTable');
  }
}

async function loadClearanceLogs() {
  if (document.getElementById('clearanceLogTable')) showTableSpinner('#clearanceLogTable');
  try {
    const q = query(collection(db, 'clearanceLogs'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    clearanceLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    populateLogFilters();
    if (document.getElementById('clearanceLogTable')) {
      renderClearanceLogs(clearanceLogs, true);
      updateSortIndicators(logSort.column, logSort.direction, true);
    }
    applyFilters();
  } catch (err) {
    console.error('Failed to load clearance logs:', err);
    showMessageModal('Failed to load clearance logs: ' + err.message);
  } finally {
    hideTableSpinner('#clearanceLogTable');
  }
}

function formatFullName(student) {
  const surname = student.surname || '';
  const firstName = student.firstName || '';
  const middle = student.middleName ? ' ' + student.middleName : '';
  return surname ? `${surname}, ${firstName}${middle}` : (firstName + middle).trim();
}

async function loadPrograms() {
  const isAdmin = window.location.pathname.includes('admin.html');
  if (isAdmin) showTableSpinner('#programsTable');
  try {
    const q = query(collection(db, 'programs'), orderBy('programCode'));
    const snapshot = await getDocs(q);
    programs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (window.location.pathname.includes('registrationPage.html')) {
      populateProgramDropdown();
    }
    if (isAdmin) {
      renderProgramsTable();
    }
  } catch (err) {
    console.error('Failed to load programs:', err);
    showMessageModal('Failed to load programs.');
  } finally {
    if (isAdmin) hideTableSpinner('#programsTable');
  }
}

function populateProgramDropdown() {
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
      <td>
        <button onclick="editProgram('${p.id}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Edit</button>
        <button onclick="deleteProgram('${p.id}')" class="delete-btn" style="padding:2px 8px;">Delete</button>
      </td>
    </tr>
  `).join('');
  updateProgramSortIndicators();
  filterProgramsTable();
}

function showAddProgramModal() {
  document.getElementById('newProgramCode').value = '';
  document.getElementById('newProgramName').value = '';
  document.getElementById('addProgramModal').style.display = 'flex';
}
function closeAddProgramModal() {
  document.getElementById('addProgramModal').style.display = 'none';
}

async function addProgram() {
  let code = document.getElementById('newProgramCode').value.trim().toUpperCase();
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
  try {
    await setDoc(doc(db, 'programs', code), {
      programCode: code,
      programName: name
    });
    closeAddProgramModal();
    loadPrograms();
    showMessageModal('Program added successfully.');
  } catch (err) {
    showMessageModal('Error adding program: ' + err.message);
  }
}

function editProgram(id) {
  const program = programs.find(p => p.id === id);
  if (!program) return;
  document.getElementById('editProgramId').value = id;
  document.getElementById('editProgramCode').value = program.programCode;
  document.getElementById('editProgramName').value = program.programName;
  document.getElementById('editProgramModal').style.display = 'flex';
}

function closeEditProgramModal() {
  document.getElementById('editProgramModal').style.display = 'none';
}

async function updateProgram() {
  const id = document.getElementById('editProgramId').value;
  const oldProgram = programs.find(p => p.id === id);
  if (!oldProgram) return;
  let code = document.getElementById('editProgramCode').value.trim().toUpperCase();
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
  if (code !== oldProgram.programCode) {
    showMessageModal('Program code cannot be changed. Delete and recreate if needed.');
    return;
  }
  try {
    await updateDoc(doc(db, 'programs', id), {
      programName: name
    });
    closeEditProgramModal();
    loadPrograms();
    showMessageModal('Program updated successfully.');
  } catch (err) {
    showMessageModal('Error updating program: ' + err.message);
  }
}

async function deleteProgram(id) {
  const program = programs.find(p => p.id === id);
  if (!program) return;
  const studentsWithProgram = allStudents.filter(s => s.program === program.programCode);
  if (studentsWithProgram.length > 0) {
    showMessageModal(`Cannot delete: ${studentsWithProgram.length} student(s) are using this program.`);
    return;
  }
  pendingDeleteProgramId = id;
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete program ${program.programCode}?`;
  document.getElementById('confirmModal').style.display = 'flex';
}

async function confirmModalAction() {
  if (pendingDeleteRfids.length > 0) {
    await confirmDelete();
  } else if (pendingDeleteLogIds.length > 0) {
    await confirmDeleteLogs();
  } else if (pendingAdminDelete.length > 0) {
    await confirmAdminDelete();
  } else if (pendingDeleteProgramId) {
    await confirmProgramDelete();
  } else if (pendingUserAction) {
    const { uid, action, newRole } = pendingUserAction;
    closeConfirmModal();
    try {
      if (action === 'approve') {
        await updateDoc(doc(db, 'users', uid), { approved: true });
        showMessageModal('User approved. User may now log in.');
      } else if (action === 'delete') {
        await deleteDoc(doc(db, 'users', uid));
        showMessageModal('User record removed from system. To fully delete the account, please remove the user from Firebase Authentication console as well.');
      } else if (action === 'updateRole') {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
        showMessageModal('Role updated.');
      }
      loadUsers();
    } catch (err) {
      showMessageModal('Error: ' + err.message);
    } finally {
      pendingUserAction = null;
    }
  } else {
    closeConfirmModal();
  }
}

async function confirmProgramDelete() {
  const id = pendingDeleteProgramId;
  closeConfirmModal();
  try {
    await deleteDoc(doc(db, 'programs', id));
    loadPrograms();
    showMessageModal('Program deleted.');
  } catch (err) {
    showMessageModal('Error deleting program: ' + err.message);
  }
}

// ==================== USER MANAGEMENT ====================
async function loadUsers() {
  const table = document.getElementById('usersTable');
  if (!table) return;
  showTableSpinner('#usersTable');
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    filteredUsers = [...users];
    sortUsers(); 
    renderUsersTable();
  } catch (err) {
    showMessageModal('Failed to load users: ' + err.message);
  } finally {
    hideTableSpinner('#usersTable');
  }
}

function capitalizeWords(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
}

function renderUsersTable() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = filteredUsers.map(user => {
    const schoolId = user.schoolId || '—';
    const fullName = user.lastName ? `${user.lastName}, ${user.firstName || ''}` : (user.firstName || '—');
    const approved = user.approved ? 'Approved' : 'Pending';
    const role = user.role || 'user';
    return `
      <tr>
        <td>${escapeHtml(schoolId)}</td>
        <td>${escapeHtml(fullName)}</td>
        <td>${escapeHtml(user.email || '')}</td>
        <td>${approved}</td>
        <td>${role}</td>
        <td>
          ${!user.approved ? `<button onclick="approveUser('${user.uid}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Approve</button>` : ''}
          <button onclick="editUser('${user.uid}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Edit</button>
          <button onclick="showDeleteUserConfirm('${user.uid}')" class="delete-btn" style="padding:2px 8px;">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function approveUser(uid) {
  pendingUserAction = { uid, action: 'approve' };
  document.getElementById('confirmMessage').innerText = 'Approve this user? They will be able to log in.';
  document.getElementById('confirmModal').style.display = 'flex';
}

function filterUsersTable() {
  const search = document.getElementById('userSearch')?.value.toLowerCase() || '';
  const roleFilter = document.getElementById('roleFilter')?.value || '';
  const approvedFilter = document.getElementById('approvedFilter')?.value || '';

  filteredUsers = users.filter(user => {
    const fullName = (user.lastName ? `${user.lastName}, ${user.firstName || ''}` : (user.firstName || '')).toLowerCase();
    const email = (user.email || '').toLowerCase();
    if (search && !fullName.includes(search) && !email.includes(search)) return false;
    if (roleFilter && user.role !== roleFilter) return false;
    if (approvedFilter === 'yes' && !user.approved) return false;
    if (approvedFilter === 'no' && user.approved) return false;
    return true;
  });
  sortUsers();
  renderUsersTable();
  updateUserSortIndicators();
}

function clearUserFilters() {
  document.getElementById('userSearch').value = '';
  document.getElementById('roleFilter').value = '';
  document.getElementById('approvedFilter').value = '';
  filterUsersTable();
}

function handleUserSort(columnIndex) {
  if (userSort.column === columnIndex) {
    userSort.direction = userSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    userSort.column = columnIndex;
    userSort.direction = 'asc';
  }
  sortUsers();
  renderUsersTable();
  updateUserSortIndicators();
}

function sortUsers() {
  if (!filteredUsers.length) return;
  const prop = getUserSortProperty(userSort.column);
  filteredUsers.sort((a, b) => {
    let valA, valB;
    if (prop === 'name') {
      valA = (a.lastName ? `${a.lastName}, ${a.firstName || ''}` : (a.firstName || '')).toLowerCase();
      valB = (b.lastName ? `${b.lastName}, ${b.firstName || ''}` : (b.firstName || '')).toLowerCase();
    } else if (prop === 'approved') {
      valA = a.approved ? 1 : 0;
      valB = b.approved ? 1 : 0;
    } else {
      valA = (a[prop] || '').toLowerCase();
      valB = (b[prop] || '').toLowerCase();
    }
    if (valA < valB) return userSort.direction === 'asc' ? -1 : 1;
    if (valA > valB) return userSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function getUserSortProperty(columnIndex) {
  const map = {
    0: 'schoolId',
    1: 'name',
    2: 'email',
    3: 'approved',
    4: 'role'
  };
  return map[columnIndex];
}

function updateUserSortIndicators() {
  const headers = document.querySelectorAll('#usersTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  const idx = userSort.column;
  if (headers[idx]) {
    headers[idx].classList.add(userSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

// ==================== IMPORT STUDENTS (FIXED FOR NUMERIC RFID) ====================
async function importStudents(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Only admin or superadmin can import
  if (!currentUserRole || (currentUserRole !== 'admin' && currentUserRole !== 'superadmin')) {
    showMessageModal('Only administrators can import students.');
    event.target.value = '';
    return;
  }

  const importBtn = document.querySelector('button[onclick*="importStudentInput"]') || event.target.nextElementSibling;
  if (importBtn) importBtn.disabled = true;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      rows = rows.filter(row => Object.values(row).some(val => val && val.toString().trim() !== ""));

      if (rows.length === 0) {
        showMessageModal('No data found in file.');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let errors = [];

      // Get current academic year (e.g., 2025-2026 based on current year)
      const currentYear = new Date().getFullYear();
      const defaultAcademicYear = `${currentYear}-${currentYear + 1}`;

      for (const row of rows) {
        // Normalize column names (case-insensitive, trimmed)
        let studentNo = (row['Student No.'] || row['Student Number'] || row['studentNo'] || row['studentNumber'] || '').toString().trim();
        const lastName = (row['Last Name'] || row['lastName'] || row['Surname'] || '').toString().trim();
        const firstName = (row['First Name'] || row['firstName'] || '').toString().trim();
        const middleInitial = (row['Middle Initial'] || row['middleInitial'] || row['Middle Name'] || '').toString().trim();
        let course = (row['Course'] || row['Program'] || row['course'] || '').toString().trim();
        let yearLevel = (row['Year Level'] || row['yearLevel'] || '').toString().trim();
        let gender = (row['Gender'] || row['gender'] || '').toString().trim();

        if (!studentNo || !lastName || !firstName || !course || !yearLevel || !gender) {
          errors.push(`Missing required fields for student: ${studentNo || 'unknown'}`);
          errorCount++;
          continue;
        }

        // Validate and format student number: must be letter followed by 6 digits, uppercase
        studentNo = studentNo.toUpperCase();
        if (!/^[A-Z]\d{6}$/.test(studentNo)) {
          errors.push(`Invalid student number format: ${studentNo} (must be letter + 6 digits, e.g., C123456)`);
          errorCount++;
          continue;
        }

        // Check if student number already exists
        const existingQuery = query(collection(db, 'students'), where('studentNumber', '==', studentNo));
        const existingSnap = await getDocs(existingQuery);
        if (!existingSnap.empty) {
          errors.push(`Student number already exists: ${studentNo}`);
          errorCount++;
          continue;
        }

        // Format names
        const formattedLastName = capitalizeWords(lastName);
        const formattedFirstName = capitalizeWords(firstName);
        const formattedMiddle = middleInitial ? capitalizeWords(middleInitial) : '';

        // Generate a numeric RFID (digits only) – required by Firestore rules
        const numericRfid = Date.now().toString() + Math.floor(Math.random() * 10000).toString();

        // Format course, year level, gender
        course = course.toUpperCase();
        yearLevel = yearLevel.charAt(0).toUpperCase() + yearLevel.slice(1).toLowerCase();
        gender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();

        const dateTime = getPhilippinesDateTimeString();

        const studentData = {
          rfidNumber: numericRfid,
          studentNumber: studentNo,
          surname: formattedLastName,
          firstName: formattedFirstName,
          middleName: formattedMiddle,
          program: course,
          yearLevel: yearLevel,
          academicYear: defaultAcademicYear,
          gender: gender,
          dateTime: dateTime
        };

        // Use the numeric RFID as document ID (required by rules: rfidNumber == studentId)
        await setDoc(doc(db, 'students', numericRfid), studentData);
        successCount++;
      }

      // Refresh the students table
      await loadStudents();

      // Clear file input
      event.target.value = '';

      let message = `Import completed. Success: ${successCount}, Failed: ${errorCount}`;
      if (errors.length > 0) {
        message += `<br><br>Errors:<br>${errors.slice(0, 5).join('<br>')}`;
        if (errors.length > 5) message += `<br> ... and ${errors.length - 5} more.`;
      }
      showMessageModal(message);
    } catch (err) {
      console.error('Import error:', err);
      showMessageModal('Import failed: ' + err.message);
    } finally {
      if (importBtn) importBtn.disabled = false;
    }
  };
  reader.readAsArrayBuffer(file);
}

// ==================== EDIT USER ====================
function editUser(uid) {
  const user = users.find(u => u.uid === uid);
  if (!user) return;
  document.getElementById('editUserId').value = uid;
  document.getElementById('editSchoolId').value = user.schoolId || '';
  document.getElementById('editFirstName').value = user.firstName || '';
  document.getElementById('editLastName').value = user.lastName || '';
  document.getElementById('editRole').value = user.role || 'user';
  document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() {
  document.getElementById('editUserModal').style.display = 'none';
}

async function updateUser() {
  const uid = document.getElementById('editUserId').value;
  const schoolId = document.getElementById('editSchoolId').value.trim().toUpperCase();
  let firstName = document.getElementById('editFirstName').value.trim();
  let lastName = document.getElementById('editLastName').value.trim();
  const role = document.getElementById('editRole').value;

  if (!firstName || !lastName) {
    showMessageModal('First Name and Last Name are required.');
    return;
  }

  firstName = capitalizeWords(firstName);
  lastName = capitalizeWords(lastName);

  try {
    await updateDoc(doc(db, 'users', uid), {
      schoolId: schoolId,
      firstName: firstName,
      lastName: lastName,
      role: role
    });
    closeEditUserModal();
    loadUsers();
    showMessageModal('User updated successfully.');
  } catch (err) {
    showMessageModal('Update failed: ' + err.message);
  }
}

function showDeleteUserConfirm(uid) {
  pendingUserAction = { uid, action: 'delete' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to delete this user from the system? This only removes the user record from Firestore. To fully delete the account, please also remove the user from Firebase Authentication console.';
  document.getElementById('confirmModal').style.display = 'flex';
}

// ==================== PASSWORD VALIDATION & REGISTRATION ====================
function checkPasswordStrength() {
  const password = document.getElementById('regPassword').value;
  const reqLength = document.getElementById('reqLength');
  const reqUpper = document.getElementById('reqUpper');
  const reqLower = document.getElementById('reqLower');
  const reqNumber = document.getElementById('reqNumber');
  const reqSpecial = document.getElementById('reqSpecial');

  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  reqLength.style.color = hasLength ? 'green' : '#666';
  reqUpper.style.color = hasUpper ? 'green' : '#666';
  reqLower.style.color = hasLower ? 'green' : '#666';
  reqNumber.style.color = hasNumber ? 'green' : '#666';
  reqSpecial.style.color = hasSpecial ? 'green' : '#666';
}

function checkPasswordMatch() {
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirmPassword').value;
  const indicator = document.getElementById('passwordMatchIndicator');
  if (confirm === '') {
    indicator.innerHTML = '';
    indicator.style.color = '';
  } else if (password === confirm) {
    indicator.innerHTML = '✓ Passwords match';
    indicator.style.color = 'green';
  } else {
    indicator.innerHTML = '✗ Passwords do not match';
    indicator.style.color = 'red';
  }
}

// ==================== REGISTRATION (new account) ====================
function showRegisterModal() {
  document.getElementById('regSchoolId').value = '';
  document.getElementById('regFirstName').value = '';
  document.getElementById('regLastName').value = '';
  document.getElementById('regEmail').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regConfirmPassword').value = '';
  document.getElementById('passwordMatchIndicator').innerHTML = '';
  document.getElementById('registerModal').style.display = 'flex';
  checkPasswordStrength();
}

function closeRegisterModal() {
  document.getElementById('registerModal').style.display = 'none';
}

async function register() {
  const schoolId = document.getElementById('regSchoolId').value.trim().toUpperCase();
  const firstName = capitalizeWords(document.getElementById('regFirstName').value.trim());
  const lastName = capitalizeWords(document.getElementById('regLastName').value.trim());
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const confirm = document.getElementById('regConfirmPassword').value.trim();

  if (!schoolId || !firstName || !lastName || !email || !password || !confirm) {
    showMessageModal('All fields are required.');
    return;
  }

  if (password.length < 8) {
    showMessageModal('Password must be at least 8 characters long.');
    return;
  }

  if (!/[A-Z]/.test(password)) {
    showMessageModal('Password must contain at least one uppercase letter.');
    return;
  }
  if (!/[a-z]/.test(password)) {
    showMessageModal('Password must contain at least one lowercase letter.');
    return;
  }
  if (!/[0-9]/.test(password)) {
    showMessageModal('Password must contain at least one number.');
    return;
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    showMessageModal('Password must contain at least one special character.');
    return;
  }

  if (password !== confirm) {
    showMessageModal('Passwords do not match.');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email: email,
      schoolId: schoolId,
      firstName: firstName,
      lastName: lastName,
      role: 'user',
      approved: false,
      createdAt: new Date()
    });
    showMessageModal('Registration successful! Please check your inbox (and spam folder) to verify your email before logging in.');
    closeRegisterModal();
    document.getElementById('regSchoolId').value = '';
    document.getElementById('regFirstName').value = '';
    document.getElementById('regLastName').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regConfirmPassword').value = '';
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showMessageModal('This email is already registered. Please use a different email or login.');
    } else if (err.code === 'auth/weak-password') {
      showMessageModal('Password is too weak. Please use a stronger password.');
    } else if (err.code === 'auth/invalid-email') {
      showMessageModal('The email address is not valid.');
    } else {
      showMessageModal('Registration failed: ' + err.message);
    }
  }
}

// ==================== SCROLL TO TOP BUTTON ====================
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
if (scrollToTopBtn) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      scrollToTopBtn.classList.add('show');
    } else {
      scrollToTopBtn.classList.remove('show');
    }
  });
  scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ==================== ADMIN STUDENT MANAGEMENT ====================
function renderAdminStudentsTable() {
  const tbody = document.querySelector('#adminStudentsTable tbody');
  if (!tbody) return;
  const sorted = sortAdminStudents(allStudents, adminStudentSort.column, adminStudentSort.direction);
  tbody.innerHTML = sorted.map(student => {
    const fullName = formatFullName(student);
    return `
      <tr>
        <td>${student.rfidNumber || ''}</td>
        <td>${fullName}</td>
        <td>${student.program || ''}</td>
        <td>${student.yearLevel || ''}</td>
        <td>${student.studentNumber || ''}</td>
        <td>${student.dateTime || ''}</td>
        <td>${student.gender || ''}</td>
        <td>
          <button onclick="editStudent('${student.id}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Edit</button>
          <button onclick="deleteSingleStudent('${student.rfidNumber}')" class="delete-btn" style="padding:2px 8px;">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
  updateAdminSortIndicators();
  filterAdminTable(); 
}

function deleteSingleStudent(rfid) {
  pendingAdminDelete = [rfid];
  document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this student?';
  document.getElementById('confirmModal').style.display = 'flex';
}

function editStudent(docId) {
  window.location.href = `registrationPage.html?docId=${encodeURIComponent(docId)}`;
}

async function confirmAdminDelete() {
  const rfids = [...pendingAdminDelete];
  closeConfirmModal();
  try {
    const promises = rfids.map(rfid => deleteDoc(doc(db, 'students', rfid)));
    await Promise.all(promises);
    loadStudents();
    if (window.location.pathname.includes('admin.html')) {
      renderAdminStudentsTable();
    }
    showMessageModal('Selected students deleted.');
  } catch (err) {
    showMessageModal('Delete failed: ' + err.message);
  }
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
  pendingAdminDelete = [];
  pendingDeleteProgramId = null;
  pendingUserAction = null;
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

function getProgramSortProperty(columnIndex) {
  return columnIndex === 0 ? 'programCode' : 'programName';
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
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortPrograms(programs, columnIndex, direction) {
  const prop = getProgramSortProperty(columnIndex);
  return [...programs].sort((a, b) => {
    const valA = (a[prop] || '').toLowerCase();
    const valB = (b[prop] || '').toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateAdminSortIndicators() {
  const headers = document.querySelectorAll('#adminStudentsTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  const idx = adminStudentSort.column;
  if (headers[idx]) {
    headers[idx].classList.add(adminStudentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function updateProgramSortIndicators() {
  const headers = document.querySelectorAll('#programsTable th');
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  const idx = programSort.column;
  if (headers[idx]) {
    headers[idx].classList.add(programSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function handleAdminSort(columnIndex) {
  if (adminStudentSort.column === columnIndex) {
    adminStudentSort.direction = adminStudentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    adminStudentSort.column = columnIndex;
    adminStudentSort.direction = 'asc';
  }
  renderAdminStudentsTable();
}

function handleProgramSort(columnIndex) {
  if (programSort.column === columnIndex) {
    programSort.direction = programSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    programSort.column = columnIndex;
    programSort.direction = 'asc';
  }
  renderProgramsTable();
}

function filterAdminTable() {
  const searchValue = document.getElementById('adminSearch')?.value.toLowerCase() || '';
  const table = document.getElementById('adminStudentsTable');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const rowText = Array.from(row.cells).slice(0, -1).map(cell => cell.textContent.toLowerCase()).join(' ');
    row.style.display = (searchValue === '' || rowText.includes(searchValue)) ? '' : 'none';
  });
}

function clearAdminFilters() {
  document.getElementById('adminSearch').value = '';
  filterAdminTable();
}

function refreshAdminTable() {
  loadStudents();
}

function filterProgramsTable() {
  const searchValue = document.getElementById('programSearch')?.value.toLowerCase() || '';
  const table = document.getElementById('programsTable');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const code = row.cells[0]?.textContent.toLowerCase() || '';
    const name = row.cells[1]?.textContent.toLowerCase() || '';
    if (searchValue === '' || code.includes(searchValue) || name.includes(searchValue)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function refreshProgramsTable() {
  loadPrograms(); 
}

function clearProgramFilters() {
  document.getElementById('programSearch').value = '';
  filterProgramsTable();
}

function renderHomeTable(students, keepSort = false) {
  const tbody = document.querySelector('#homeTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortStudents(students, homeSort.column, homeSort.direction) : students;
  tbody.innerHTML = data.map(student => {
    const fullName = formatFullName(student);
    const datePart = student.dateTime ? student.dateTime.split(' ')[0] : '';
    return `
      <tr>
        <td style="width: 30px; text-align: center;">
          <input type="checkbox" class="home-checkbox" data-doc-id="${student.id}" onchange="updateSelectAllHomeState()">
        </td>
        <td>${student.rfidNumber || ''}</td>
        <td>${student.studentNumber || ''}</td>
        <td>${fullName}</td>
        <td>${student.program || ''}</td>
        <td>${student.yearLevel || ''}</td>
        <td>${student.academicYear || ''}</td>
        <td>${student.gender || ''}</td>
        <td>${datePart}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

function populateCourseFilter() {
  const select = document.getElementById('courseFilter');
  if (!select) return;
  const courses = [...new Set(allStudents.map(s => s.program).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All</option>' + 
    courses.map(c => `<option value="${c}">${c}</option>`).join('');
}

function updateSelectAllHomeState() {
  const selectAll = document.getElementById('selectAllHome');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#homeTable tbody .home-checkbox');
  selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}

function toggleSelectAllHome(selectAllCheckbox) {
  const checkboxes = document.querySelectorAll('#homeTable tbody .home-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateSelectAllHomeState();
}

function editSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select a student to edit.');
    return;
  }
  if (selected.length > 1) {
    showMessageModal('Please select only one student to edit.');
    return;
  }
  const docId = selected[0].getAttribute('data-doc-id');
  window.location.href = `registrationPage.html?docId=${encodeURIComponent(docId)}`;
}

function deleteSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one student to delete.');
    return;
  }
  pendingDeleteRfids = Array.from(selected).map(cb => cb.getAttribute('data-doc-id'));
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selected.length} selected student(s)?`;
  document.getElementById('confirmModal').style.display = 'flex';
}

async function confirmDelete() {
  const rfids = [...pendingDeleteRfids];
  closeConfirmModal();
  try {
    const promises = rfids.map(rfid => deleteDoc(doc(db, 'students', rfid)));
    await Promise.all(promises);
    loadStudents();
    showMessageModal('Selected students deleted.');
  } catch (err) {
    showMessageModal('Delete failed: ' + err.message);
  }
}

function populateStudentFilters() {
  const acadSelect = document.getElementById('acadYearFilterHome');
  if (!acadSelect) return;
  const acadYears = [...new Set(allStudents.map(s => s.academicYear).filter(Boolean))].sort();
  acadSelect.innerHTML = '<option value="">All</option>' + 
    acadYears.map(ay => `<option value="${ay}">${ay}</option>`).join('');
}

function renderClearanceLogs(logs, keepSort = false) {
  const tbody = document.querySelector('#clearanceLogTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortLogs(logs, logSort.column, logSort.direction) : logs;
  tbody.innerHTML = data.map(log => {
    const status = log.status || '';
    let displayStatus = status;
    if (status === 'Claimed' && !log.returnedDate) {
      displayStatus = 'Pending';
    }
    const releaseDate = log.claimedDate ? new Date(log.claimedDate.seconds * 1000).toLocaleString() : '';
    const receiveDate = log.returnedDate ? new Date(log.returnedDate.seconds * 1000).toLocaleString() : '';
    const remarks = log.remarks || '';
    const academicYear = log.academicYear || '';
    const semester = log.semester || '';
    const idNumber = log.studentNumber || '';
    const name = log.name || '';
    const program = log.program || '';
    const yearLevel = log.yearLevel || '';
    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="log-checkbox" data-log-id="${log.id}" onchange="updateSelectAllLogsState()">
        </td>
        <td>${log.rfid || ''}</td>
        <td>${idNumber}</td>
        <td>${name}</td>
        <td>${releaseDate}</td>
        <td>${receiveDate}</td>
        <td>${academicYear}</td>
        <td>${semester}</td>
        <td>${yearLevel}</td>
        <td>${program}</td>
        <td>${remarks}</td>
        <td data-status="${status}">${displayStatus}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

function getSortProperty(columnIndex, isLogTable) {
  if (isLogTable) {
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
  } else {
    const map = {
      1: 'rfidNumber',
      2: 'studentNumber',
      3: 'name',
      4: 'program',
      5: 'yearLevel',
      6: 'academicYear',
      7: 'gender',
      8: 'dateTime'
    };
    return map[columnIndex];
  }
}

function sortLogs(logs, columnIndex, direction) {
  const prop = getSortProperty(columnIndex, true);
  if (!prop) return logs;
  return [...logs].sort((a, b) => {
    let valA = a[prop] || '';
    let valB = b[prop] || '';
    if (prop === 'claimedDate' || prop === 'returnedDate') {
      valA = valA ? valA.seconds : 0;
      valB = valB ? valB.seconds : 0;
    } else {
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
    }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortStudents(students, columnIndex, direction) {
  const prop = getSortProperty(columnIndex, false);
  if (!prop) return students;
  return [...students].sort((a, b) => {
    let valA, valB;
    if (prop === 'name') {
      valA = (a.surname || '') + ', ' + (a.firstName || '') + (a.middleName ? ' ' + a.middleName : '');
      valB = (b.surname || '') + ', ' + (b.firstName || '') + (b.middleName ? ' ' + b.middleName : '');
    } else {
      valA = a[prop] || '';
      valB = b[prop] || '';
    }
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortIndicators(columnIndex, direction, isLogTable) {
  const tableId = isLogTable ? '#clearanceLogTable' : '#homeTable';
  const headers = document.querySelectorAll(`${tableId} th`);
  headers.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  if (headers[columnIndex]) {
    headers[columnIndex].classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function handleSort(columnIndex) {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  let sort = isLogTable ? logSort : homeSort;
  if (sort.column === columnIndex) {
    sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sort.column = columnIndex;
    sort.direction = 'asc';
  }
  if (isLogTable) {
    logSort = sort;
    renderClearanceLogs(clearanceLogs, true);
  } else {
    homeSort = sort;
    renderHomeTable(allStudents, true);
  }
  updateSortIndicators(columnIndex, sort.direction, isLogTable);
}

function attachSortListeners() {
  if (document.getElementById('homeTable')) {
    const homeHeaders = document.querySelectorAll('#homeTable th');
    homeHeaders.forEach((th, index) => {
      if (index === 0) return;
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
  if (document.getElementById('clearanceLogTable')) {
    const logHeaders = document.querySelectorAll('#clearanceLogTable th');
    logHeaders.forEach((th, index) => {
      if (index === 0) return;
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
}

function editSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select a student to edit.');
    return;
  }
  if (selected.length > 1) {
    showMessageModal('Please select only one student to edit.');
    return;
  }
  const docId = selected[0].getAttribute('data-doc-id');
  window.location.href = `registrationPage.html?docId=${encodeURIComponent(docId)}`;
}

function deleteSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one student to delete.');
    return;
  }
  pendingDeleteRfids = Array.from(selected).map(cb => cb.getAttribute('data-doc-id'));
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selected.length} selected student(s)?`;
  document.getElementById('confirmModal').style.display = 'flex';
}

async function checkRFID() {
  const rfid = document.getElementById('rfidNumber').value.trim();
  if (!rfid) return;
  try {
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setupEditMode(rfid);
    } else {
      document.getElementById('rfidNumber').disabled = false;
      document.getElementById('studentNumber').disabled = false;
      document.getElementById('surname').disabled = false;
      document.getElementById('firstName').disabled = false;
      document.getElementById('middleName').disabled = false;
      document.getElementById('date').disabled = false;
      const btn = document.getElementById('registerButton');
      btn.textContent = 'REGISTER';
      btn.onclick = validateAndRegister;
      isEditMode = false;
    }
  } catch (err) {
    console.error('RFID check error:', err);
    showMessageModal('Error checking RFID.');
  }
}

async function setupEditMode(docId) {
  try {
    const docRef = doc(db, 'students', docId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found. Redirecting...');
      setTimeout(() => window.location.href = 'home.html', 1500);
      return;
    }
    const student = docSnap.data();
    const studentId = docSnap.id;
    const hasRfid = !!student.rfidNumber;
    const studentType = hasRfid ? 'new' : 'old';
    document.getElementById('studentType').value = studentType;
    if (studentType === 'new') {
      switchRegistrationTab('new');
      document.getElementById('rfidNumber').value = student.rfidNumber || '';
      document.getElementById('studentNumber').value = student.studentNumber || '';
      document.getElementById('rfidNumber').disabled = true;
      document.getElementById('studentNumber').disabled = true;
    } else {
      switchRegistrationTab('old');
    }
    document.querySelector('[data-field="surname"]').value = student.surname || '';
    document.querySelector('[data-field="firstName"]').value = student.firstName || '';
    document.querySelector('[data-field="middleName"]').value = student.middleName || '';
    document.querySelector('[data-field="program"]').value = student.program || '';
    document.querySelector('[data-field="yearLevel"]').value = student.yearLevel || '';
    document.querySelector('[data-field="gender"]').value = student.gender || '';
    const academicYearSelect = document.getElementById('academicYear');
    if (student.academicYear) {
      academicYearSelect.value = student.academicYear;
    } else {
      academicYearSelect.selectedIndex = 0;
    }
    if (student.dateTime) {
      const originalDate = student.dateTime.split(' ')[0];
      document.getElementById('date').value = originalDate;
      updateDisplayDate();
    } else {
      setDefaultDate();
    }
    document.querySelector('[data-field="surname"]').disabled = false;
    document.querySelector('[data-field="firstName"]').disabled = false;
    document.querySelector('[data-field="middleName"]').disabled = false;
    document.querySelector('[data-field="program"]').disabled = false;
    document.querySelector('[data-field="yearLevel"]').disabled = false;
    document.querySelector('[data-field="gender"]').disabled = false;
    const btn = document.getElementById('registerButton');
    btn.textContent = 'UPDATE';
    btn.onclick = () => validateAndUpdate(studentId);
    isEditMode = true;
  } catch (err) {
    console.error('Edit setup error:', err);
    showMessageModal('Error loading student data.');
  }
}

async function registerOldStudent() {
  clearAllFieldErrors();
  formatAllNameFields();
  if (!validateDateIsToday()) return;
  const surname = document.getElementById('surname').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const middleName = document.getElementById('middleName').value.trim();
  const program = document.getElementById('program').value;
  const yearLevel = document.getElementById('yearLevel').value;
  const academicYear = document.getElementById('academicYear').value;
  const gender = document.getElementById('gender').value;
  let hasErrors = false;
  if (!surname) { showFieldError('surname'); hasErrors = true; }
  if (!firstName) { showFieldError('firstName'); hasErrors = true; }
  if (!program) { showFieldError('program'); hasErrors = true; }
  if (!yearLevel) { showFieldError('yearLevel'); hasErrors = true; }
  if (!academicYear) { showFieldError('academicYear'); hasErrors = true; }
  if (!gender) { showFieldError('gender'); hasErrors = true; }
  if (hasErrors) {
    showMessageModal('Please fill in all required fields.');
    return;
  }
  const dateTime = getPhilippinesDateTimeString();
  const student = {
    surname, firstName, middleName, program, yearLevel, academicYear, gender, dateTime,
  };
  try {
    await addDoc(collection(db, 'students'), student);
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('yearLevel').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;
    setDefaultDate();
    document.getElementById('successModal').style.display = 'flex';
  } catch (err) {
    console.error('Old student registration error:', err);
    showMessageModal('Registration failed: ' + err.message);
  }
}

function toggleRegistrationType(type) {
  const newFields = document.getElementById('newStudentFields');
  const rfidInput = document.getElementById('rfidNumber');
  const studentNumberInput = document.getElementById('studentNumber');
  const registerBtn = document.getElementById('registerButton');
  if (type === 'new') {
    newFields.style.display = 'block';
    rfidInput.disabled = false;
    studentNumberInput.disabled = false;
    registerBtn.onclick = validateAndRegister;
    registerBtn.textContent = 'REGISTER';
    resetRegistrationForm();
  } else {
    newFields.style.display = 'none';
    rfidInput.disabled = true;
    studentNumberInput.disabled = true;
    registerBtn.onclick = registerOldStudent;
    registerBtn.textContent = 'REGISTER OLD STUDENT';
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('yearLevel').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;
    setDefaultDate();
  }
}

function validateDateIsToday() {
  const dateInput = document.getElementById('date');
  const selectedDate = dateInput.value;
  const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
  const phDate = phNow.toISOString().split('T')[0];
  if (selectedDate !== phDate) {
    showFieldError('date');
    showMessageModal('Date must be today\'s date.');
    return false;
  }
  return true;
}

async function validateAndUpdate(docId) {
  clearAllFieldErrors();
  formatAllNameFields();
  const studentType = document.getElementById('studentType').value;
  const formData = {
    docId: docId,
    surname: document.querySelector('[data-field="surname"]').value.trim(),
    firstName: document.querySelector('[data-field="firstName"]').value.trim(),
    middleName: document.querySelector('[data-field="middleName"]').value.trim(),
    program: document.querySelector('[data-field="program"]').value,
    yearLevel: document.querySelector('[data-field="yearLevel"]').value,
    gender: document.querySelector('[data-field="gender"]').value,
    academicYear: document.getElementById('academicYear').value,
    date: document.getElementById('date').value.trim()
  };
  if (studentType === 'new') {
    formData.rfidNumber = document.getElementById('rfidNumber').value.trim();
    formData.studentNumber = document.getElementById('studentNumber').value.trim();
  }
  let hasErrors = false;
  if (studentType === 'new') {
    if (!formData.rfidNumber) { showFieldError('rfidNumber'); hasErrors = true; }
    if (!formData.studentNumber) { showFieldError('studentNumber'); hasErrors = true; }
  }
  if (!formData.surname) { showFieldError('surname'); hasErrors = true; }
  if (!formData.firstName) { showFieldError('firstName'); hasErrors = true; }
  if (!formData.program) { showFieldError('program'); hasErrors = true; }
  if (!formData.yearLevel) { showFieldError('yearLevel'); hasErrors = true; }
  if (!formData.academicYear) { showFieldError('academicYear'); hasErrors = true; }
  if (!formData.gender) { showFieldError('gender'); hasErrors = true; }
  if (hasErrors) {
    showMessageModal('Please fill in all required fields.');
    return;
  }
  if (studentType === 'new') {
    const isDuplicate = await isStudentNumberDuplicate(formData.studentNumber, formData.rfidNumber);
    if (isDuplicate) {
      showFieldError('studentNumber');
      showMessageModal('Student number already exists.');
      return;
    }
    if (!isValidStudentNumber(formData.studentNumber)) {
      showFieldError('studentNumber');
      showMessageModal('Student number must start with a letter followed by exactly 6 digits (e.g., C123456).');
      return;
    }
  }
  document.getElementById('updateConfirmMessage').innerText = 'Are you sure you want to update this student?';
  document.getElementById('updateConfirmModal').style.display = 'flex';
  window.pendingUpdateData = formData;
}

function closeUpdateConfirmModal() {
  document.getElementById('updateConfirmModal').style.display = 'none';
  delete window.pendingUpdateData;
}

async function confirmUpdate() {
  const formData = window.pendingUpdateData;
  closeUpdateConfirmModal();
  if (!formData) return;
  try {
    const docRef = doc(db, 'students', formData.docId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const currentStudent = docSnap.data();
    const updatedStudent = {
      ...currentStudent,
      surname: formData.surname,
      firstName: formData.firstName,
      middleName: formData.middleName,
      program: formData.program,
      yearLevel: formData.yearLevel,
      gender: formData.gender,
      academicYear: formData.academicYear,
    };
    if (formData.studentNumber) {
      updatedStudent.studentNumber = formData.studentNumber;
    }
    await setDoc(docRef, updatedStudent);
    document.getElementById('updateSuccessMessage').innerText = 'Update successful!';
    document.getElementById('updateSuccessModal').style.display = 'flex';
  } catch (err) {
    if (err.code === 'permission-denied') {
      showMessageModal('Update not allowed: some fields cannot be changed.');
    } else {
      showMessageModal('Update failed: ' + err.message);
    }
  } finally {
    delete window.pendingUpdateData;
  }
}

function redirectAfterUpdate() {
  document.getElementById('updateSuccessModal').style.display = 'none';
  window.location.href = 'home.html';
}

async function validateAndRegister() {
  clearAllFieldErrors();
  formatAllNameFields();
  if (!validateDateIsToday()) return;
  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    surname: document.querySelector('[data-field="surname"]').value.trim(),
    firstName: document.querySelector('[data-field="firstName"]').value.trim(),
    middleName: document.querySelector('[data-field="middleName"]').value.trim(),
    program: document.querySelector('[data-field="program"]').value,
    yearLevel: document.querySelector('[data-field="yearLevel"]').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
    academicYear: document.getElementById('academicYear').value,
    date: document.getElementById('date').value.trim(),
    gender: document.querySelector('[data-field="gender"]').value
  };
  let hasErrors = false;
  if (!formData.rfidNumber) { showFieldError('rfidNumber'); hasErrors = true; }
  if (!formData.surname) { showFieldError('surname'); hasErrors = true; }
  if (!formData.firstName) { showFieldError('firstName'); hasErrors = true; }
  if (!formData.program) { showFieldError('program'); hasErrors = true; }
  if (!formData.yearLevel) { showFieldError('yearLevel'); hasErrors = true; }
  if (!formData.studentNumber) { showFieldError('studentNumber'); hasErrors = true; }
  if (!formData.academicYear) { showFieldError('academicYear'); hasErrors = true; }
  if (!formData.gender) { showFieldError('gender'); hasErrors = true; }
  if (hasErrors) {
    showMessageModal('Please fill in all required fields.');
    return;
  }
  const isDuplicate = await isStudentNumberDuplicate(formData.studentNumber);
  if (isDuplicate) {
    showFieldError('studentNumber');
    showMessageModal('Student number already exists.');
    return;
  }
  if (!isValidStudentNumber(formData.studentNumber)) {
    showFieldError('studentNumber');
    showMessageModal('Student number must start with a letter followed by exactly 6 digits (e.g., A123456).');
    return;
  }
  registerStudent(formData);
}

async function registerStudent(formData) {
  const dateTime = getPhilippinesDateTimeString();
  const student = {
    rfidNumber: formData.rfidNumber,
    surname: formData.surname,
    firstName: formData.firstName,
    middleName: formData.middleName,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    academicYear: formData.academicYear,
    dateTime: dateTime,
    gender: formData.gender,
  };
  try {
    await setDoc(doc(db, 'students', formData.rfidNumber), student);
    resetRegistrationForm();
    document.getElementById('successModal').style.display = 'flex';
  } catch (err) {
    if (err.code === 'permission-denied') {
      showMessageModal('Permission denied. Check Firestore security rules.');
    } else if (err.code === 'already-exists') {
      showMessageModal('RFID number already exists.');
    } else {
      showMessageModal('Registration failed: ' + err.message);
    }
  }
}

function closeSuccessModal() {
  document.getElementById('successModal').style.display = 'none';
}

function resetRegistrationForm() {
  document.getElementById('rfidNumber').value = '';
  document.getElementById('surname').value = '';
  document.getElementById('firstName').value = '';
  document.getElementById('middleName').value = '';
  document.getElementById('studentNumber').value = '';
  const program = document.getElementById('program');
  if (program) program.selectedIndex = 0;
  const year = document.getElementById('yearLevel');
  if (year) year.selectedIndex = 0;
  const academicYear = document.getElementById('academicYear');
  if (academicYear) academicYear.selectedIndex = 0;
  const gender = document.getElementById('gender');
  if (gender) gender.selectedIndex = 0;
  document.getElementById('rfidNumber').disabled = false;
  document.getElementById('surname').disabled = false;
  document.getElementById('firstName').disabled = false;
  document.getElementById('middleName').disabled = false;
  document.getElementById('studentNumber').disabled = false;
  const btn = document.getElementById('registerButton');
  btn.textContent = 'REGISTER';
  btn.onclick = validateAndRegister;
  isEditMode = false;
  clearAllFieldErrors();
  setDefaultDate();
}

function clearRegistrationForm() {
  if (isEditMode) {
    document.querySelector('[data-field="surname"]').value = '';
    document.querySelector('[data-field="firstName"]').value = '';
    document.querySelector('[data-field="middleName"]').value = '';
    const program = document.querySelector('[data-field="program"]');
    if (program) program.selectedIndex = 0;
    const gender = document.querySelector('[data-field="gender"]');
    if (gender) gender.selectedIndex = 0;
    clearAllFieldErrors();
  } else {
    const studentType = document.getElementById('studentType').value;
    if (studentType === 'new') {
      document.getElementById('rfidNumber').value = '';
      document.getElementById('studentNumber').value = '';
    }
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('yearLevel').selectedIndex = 0;
    document.getElementById('academicYear').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;
    clearAllFieldErrors();
  }
}

function refreshRegistrationForm() {
  resetRegistrationForm();
}

function showFieldError(fieldId) {
  document.getElementById(fieldId).classList.add('error-field');
}
function clearAllFieldErrors() {
  document.querySelectorAll('.registration-layout input, .registration-layout select').forEach(f => f.classList.remove('error-field'));
}
function clearFieldError(fieldId) {
  document.getElementById(fieldId).classList.remove('error-field');
}

function capitalizeNameWords(str) {
  if (!str) return '';
  str = str.trim().toLowerCase();
  return str.replace(/(^|[-\s'])(\p{Ll})/gu, (match, separator, letter) => separator + letter.toUpperCase());
}

function formatAllNameFields() {
  const surname = document.getElementById('surname');
  const firstName = document.getElementById('firstName');
  const middleName = document.getElementById('middleName');
  if (surname) surname.value = capitalizeNameWords(surname.value);
  if (firstName) firstName.value = capitalizeNameWords(firstName.value);
  if (middleName) middleName.value = capitalizeNameWords(middleName.value);
}

function formatProgramName(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(^|\s)([a-z])/g, (match, separator, letter) => separator + letter.toUpperCase());
}

function formatStudentNumber(input) {
  let val = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (val.length > 0 && !/^[A-Z]$/.test(val[0])) {
    const firstLetterIndex = val.search(/[A-Z]/);
    if (firstLetterIndex >= 0) {
      val = val.slice(firstLetterIndex);
    } else {
      val = '';
    }
  }
  if (val.length > 1) {
    const first = val[0];
    const rest = val.slice(1).replace(/[^0-9]/g, '');
    val = first + rest;
  }
  if (val.length > 7) val = val.slice(0, 7);
  input.value = val;
}

function isValidStudentNumber(studentNumber) {
  return /^[A-Z]\d{6}$/.test(studentNumber);
}

async function searchStudent() {
  const input = document.getElementById('rfidSearch').value.trim();
  if (!input) {
    showMessageModal('Please enter an RFID or Student Number.');
    return;
  }
  try {
    let student = null;
    const docRef = doc(db, 'students', input);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      student = docSnap.data();
    } else {
      const q = query(collection(db, 'students'), where('studentNumber', '==', input));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        student = querySnap.docs[0].data();
      }
    }
    if (student) {
      currentStudentForUpdate = student;
      displayStudentForUpdate(student);
    } else {
      showMessageModal('No student found with that RFID or Student Number.');
    }
  } catch (err) {
    console.error('Search error:', err);
    showMessageModal('Error searching for student.');
  }
}

function displayStudentForUpdate(student) {
  const container = document.getElementById('studentResult');
  container.style.display = 'block';
  const fullName = formatFullName(student);
  const defaultRemarks = 'None';
  const defaultSemester = '1st';
  const semesterOptions = `
    <option value="" disabled>Select Semester</option>
    <option value="1st" ${defaultSemester === '1st' ? 'selected' : ''}>1st Semester</option>
    <option value="2nd" ${defaultSemester === '2nd' ? 'selected' : ''}>2nd Semester</option>
  `;
  container.innerHTML = `
    <div class="student-details">
      <table class="student-info-table">
        <tr><th>Name</th><td>${fullName}</td></tr>
        <tr><th>Program</th><td>${student.program || ''}</td></tr>
        <tr><th>Year Level</th><td>${student.yearLevel || ''}</td></tr>
        <tr><th>Student Number</th><td>${student.studentNumber || ''}</td></tr>
        <tr><th>Academic Year</th><td>${student.academicYear || ''}</td></tr>
        <tr><th>Gender</th><td>${student.gender || ''}</td></tr>
      </table>
      <div class="button-group">
        <button class="btn-release" onclick="releaseStudent('${student.rfidNumber}')">RELEASE</button>
        <button class="btn-receive" onclick="receiveStudent('${student.rfidNumber}')">RECEIVE</button>
      </div>
      <div class="dropdown-group">
        <div class="dropdown-item">
          <label>Remarks</label>
          <select id="updateRemarks" class="remarks-select">
            <option value="None" ${defaultRemarks === 'None' ? 'selected' : ''}>None</option>
            <option value="Graduating" ${defaultRemarks === 'Graduating' ? 'selected' : ''}>Graduating</option>
            <option value="Moving Up" ${defaultRemarks === 'Moving Up' ? 'selected' : ''}>Moving Up</option>
            <option value="Transferring" ${defaultRemarks === 'Transferring' ? 'selected' : ''}>Transferring</option>
            <option value="Returning" ${defaultRemarks === 'Returning' ? 'selected' : ''}>Returning</option>
            <option value="Transfer" ${defaultRemarks === 'Transfer' ? 'selected' : ''}>Transfer</option>
            <option value="Drop" ${defaultRemarks === 'Drop' ? 'selected' : ''}>Drop</option>
          </select>
        </div>
        <div class="dropdown-item">
          <label>Semester</label>
          <select id="updateSemester" class="semester-select">
            ${semesterOptions}
          </select>
        </div>
      </div>
    </div>
  `;
  attachStatusUpdateHoverScroll();
}

function attachStatusUpdateHoverScroll() {
  const selects = document.querySelectorAll('#updateRemarks, #updateAcadYear, #updateSemester');
  selects.forEach(select => {
    select.removeEventListener('wheel', handleStatusUpdateWheel);
    select.addEventListener('wheel', handleStatusUpdateWheel, { passive: false });
  });
}

function handleStatusUpdateWheel(e) {
  if (document.activeElement !== e.target) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const newIndex = e.target.selectedIndex + delta;
    if (newIndex >= 0 && newIndex < e.target.options.length) {
      e.target.selectedIndex = newIndex;
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function populateAcademicYearDropdown() {
  const select = document.getElementById('academicYear');
  if (!select) return;
  const currentYear = new Date().getFullYear();
  select.innerHTML = '<option value="" disabled selected>Select A.Y.</option>';
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const acad = `${year}-${year + 1}`;
    const option = document.createElement('option');
    option.value = acad;
    option.textContent = acad;
    select.appendChild(option);
  }
}

async function findOpenClaim(rfid) {
  const q = query(
    collection(db, 'clearanceLogs'),
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

async function createReleaseLog(rfid, student, claimedDate, academicYear, semester, remarks) {
  const fullName = formatFullName(student);
  const logData = {
    rfid: rfid,
    studentNumber: student.studentNumber || '',
    name: fullName,
    program: student.program || '',
    yearLevel: student.yearLevel || '',
    status: 'Claimed',
    claimedDate: claimedDate,
    returnedDate: null,
    academicYear: academicYear || '',
    semester: semester || '',
    remarks: remarks || '',
    timestamp: new Date()
  };
  await addDoc(collection(db, 'clearanceLogs'), logData);
}

async function updateLogWithReturn(logId, returnedDate, newRemarks, newAcadYear, newSemester) {
  const updateData = {
    status: 'Returned',
    returnedDate: returnedDate,
    remarks: newRemarks,
    academicYear: newAcadYear,
    semester: newSemester
  };
  await updateDoc(doc(db, 'clearanceLogs', logId), updateData);
}

function isValidAcademicYear(year) {
  return /^\d{4}-\d{4}$/.test(year);
}

async function releaseStudent(rfid) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newSemester = document.getElementById('updateSemester').value;
    if (!newSemester) {
      showMessageModal('Please select a semester to proceed.');
      return;
    }
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const student = docSnap.data();
    if (!student.academicYear) {
      showMessageModal('Student does not have an academic year set. Please update the student record first.');
      return;
    }
    const openClaim = await findOpenClaim(rfid);
    if (openClaim) {
      showMessageModal('Student has already claimed. Please return first.');
      return;
    }
    const now = new Date();
    await createReleaseLog(
      rfid,
      student,
      now,
      student.academicYear,
      newSemester,
      newRemarks
    );
    showMessageModal('Student clearance form released successfully.');
    clearStatusUpdate();
    loadClearanceLogs();
  } catch (err) {
    console.error('Release error:', err);
    showMessageModal('Release failed: ' + err.message);
  } finally {
    isProcessing = false;
  }
}

async function receiveStudent(rfid) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newSemester = document.getElementById('updateSemester').value;
    if (!newSemester) {
      showMessageModal('Please select a semester to proceed.');
      return;
    }
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const student = docSnap.data();
    if (!student.academicYear) {
      showMessageModal('Student does not have an academic year set. Please update the student record first.');
      return;
    }
    const openClaim = await findOpenClaim(rfid);
    if (!openClaim) {
      showMessageModal('Student has yet to claim form. Please release first.');
      return;
    }
    const now = new Date();
    await updateLogWithReturn(
      openClaim.id,
      now,
      newRemarks,
      student.academicYear,
      newSemester
    );
    showMessageModal('Student clearance form has been returned successfully.');
    clearStatusUpdate();
    loadClearanceLogs();
  } catch (err) {
    console.error('Receive error:', err);
    showMessageModal('Receive failed: ' + err.message);
  } finally {
    isProcessing = false;
  }
}

function showMessageModal(text) {
  document.getElementById('messageModalText').innerHTML = text;
  document.getElementById('messageModal').style.display = 'flex';
}

function closeMessageModal() {
  document.getElementById('messageModal').style.display = 'none';
}

function closeErrorModal() {
  document.getElementById('errorModal').style.display = 'none';
}

function togglePassword() {
  const passwordInput = document.getElementById('password');
  const checkbox = event.target;
  if (checkbox.checked) {
    passwordInput.style.removeProperty('-webkit-text-security');
    passwordInput.type = 'text';
  } else {
    passwordInput.style.setProperty('-webkit-text-security', 'disc');
    passwordInput.type = 'text';
  }
}

function toggleRegPassword() {
  const passwordField = document.getElementById('regPassword');
  const confirmField = document.getElementById('regConfirmPassword');
  const checkbox = document.getElementById('showRegPassword');
  if (checkbox.checked) {
    passwordField.type = 'text';
    confirmField.type = 'text';
  } else {
    passwordField.type = 'password';
    confirmField.type = 'password';
  }
}

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

function setDefaultDate() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;
  const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
  const yyyy = phNow.getUTCFullYear();
  const mm = String(phNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(phNow.getUTCDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
  updateDisplayDate();
}

function updateDisplayDate() {
  const dateInput = document.getElementById('date');
  const displaySpan = document.getElementById('displayDate');
  if (dateInput && displaySpan) {
    displaySpan.textContent = dateInput.value;
  }
}

function initializeDateFilters() {
  const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
  const currentYear = phNow.getUTCFullYear();
  const today = phNow.toISOString().split('T')[0];
  const startOfYear = `${currentYear}-01-01`;
  const dateFromLogs = document.getElementById('dateFrom');
  const dateToLogs = document.getElementById('dateTo');
  if (dateFromLogs && dateToLogs) {
    if (!dateFromLogs.value) dateFromLogs.value = startOfYear;
    if (!dateToLogs.value) dateToLogs.value = today;
  }
  const dateFromHome = document.getElementById('dateFromHome');
  const dateToHome = document.getElementById('dateToHome');
  if (dateFromHome && dateToHome) {
    if (!dateFromHome.value) dateFromHome.value = startOfYear;
    if (!dateToHome.value) dateToHome.value = today;
  }
}

function populateLogFilters() {
  const semesterSet = new Set();
  const remarksSet = new Set();
  const courseSet = new Set();
  const yearSet = new Set();
  const acadYearSet = new Set();
  clearanceLogs.forEach(log => {
    if (log.semester) semesterSet.add(log.semester);
    if (log.remarks) remarksSet.add(log.remarks);
    if (log.program) courseSet.add(log.program);
    if (log.yearLevel) yearSet.add(log.yearLevel);
    if (log.academicYear) acadYearSet.add(log.academicYear);
  });
  const semesterFilter = document.getElementById('semesterFilter');
  const remarksFilter = document.getElementById('remarksFilter');
  const courseFilter = document.getElementById('courseFilterLogs');
  const yearFilter = document.getElementById('yearFilterLogs');
  const acadYearFilter = document.getElementById('acadYearFilter');
  if (semesterFilter) {
    semesterFilter.innerHTML = '<option value="">All</option>' +
      [...semesterSet].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  }
  if (remarksFilter) {
    remarksFilter.innerHTML = '<option value="">All</option>' +
      [...remarksSet].sort().map(r => `<option value="${r}">${r}</option>`).join('');
  }
  if (courseFilter) {
    courseFilter.innerHTML = '<option value="">All</option>' +
      [...courseSet].sort().map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (yearFilter) {
    yearFilter.innerHTML = '<option value="">All</option>' +
      [...yearSet].sort().map(y => `<option value="${y}">${y}</option>`).join('');
  }
  if (acadYearFilter) {
    acadYearFilter.innerHTML = '<option value="">All</option>' +
      [...acadYearSet].sort().map(ay => `<option value="${ay}">${ay}</option>`).join('');
  }
}

let searchTimeout;
function applyFilters() {
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
  const acadYearFilter = document.getElementById('acadYearFilter')?.value || '';
  let dateFrom = null, dateTo = null;
  if (isLogTable) {
    dateFrom = document.getElementById('dateFrom')?.value;
    dateTo = document.getElementById('dateTo')?.value;
  } else {
    dateFrom = document.getElementById('dateFromHome')?.value;
    dateTo = document.getElementById('dateToHome')?.value;
  }
  const courseFilterHome = document.getElementById('courseFilter')?.value || '';
  const yearFilterHome = document.getElementById('yearFilter')?.value || '';
  const acadYearFilterHome = document.getElementById('acadYearFilterHome')?.value || '';
  const genderFilterHome = document.getElementById('genderFilterHome')?.value || '';
  const rows = document.querySelectorAll(`${tableId} tbody tr`);
  rows.forEach(row => {
    let show = true;
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }
    if (show) {
      if (isLogTable) {
        const statusCell = row.cells[11];
        const dataStatus = statusCell?.getAttribute('data-status') || '';
        const semesterCell = row.cells[7];
        const remarksCell = row.cells[10];
        const courseCell = row.cells[9];
        const yearCell = row.cells[8];
        const acadYearCell = row.cells[6];
        const releaseCell = row.cells[4];
        const receiveCell = row.cells[5];
        if (statusFilter && dataStatus !== statusFilter) show = false;
        if (show && semesterFilter && semesterCell && semesterCell.innerText.trim() !== semesterFilter) show = false;
        if (show && remarksFilter && remarksCell && remarksCell.innerText.trim() !== remarksFilter) show = false;
        if (show && courseFilterLogs && courseCell && courseCell.innerText.trim() !== courseFilterLogs) show = false;
        if (show && yearFilterLogs && yearCell && yearCell.innerText.trim() !== yearFilterLogs) show = false;
        if (show && acadYearFilter && acadYearCell && acadYearCell.innerText.trim() !== acadYearFilter) show = false;
        if (show && (dateFrom || dateTo)) {
          let rowDateValid = false;
          const parseDate = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
          };
          const fromDate = dateFrom ? parseDate(dateFrom) : null;
          const toDate = dateTo ? parseDate(dateTo) : null;
          const releaseStr = releaseCell.innerText.trim();
          const receiveStr = receiveCell.innerText.trim();
          const releaseDate = releaseStr ? parseDate(releaseStr) : null;
          const receiveDate = receiveStr ? parseDate(receiveStr) : null;
          const checkDate = (d) => {
            if (!d) return false;
            if (fromDate && d < fromDate) return false;
            if (toDate && d > toDate) return false;
            return true;
          };
          if (releaseDate && checkDate(releaseDate)) rowDateValid = true;
          if (receiveDate && checkDate(receiveDate)) rowDateValid = true;
          if (!rowDateValid) show = false;
        }
      } else {
        const courseCell = row.cells[4];
        const yearCell = row.cells[5];
        const acadYearCell = row.cells[6];
        const genderCell = row.cells[7];
        const dateCell = row.cells[8];
        if (courseFilterHome && courseCell && courseCell.innerText.trim() !== courseFilterHome) show = false;
        if (show && yearFilterHome && yearCell && yearCell.innerText.trim() !== yearFilterHome) show = false;
        if (show && acadYearFilterHome && acadYearCell && acadYearCell.innerText.trim() !== acadYearFilterHome) show = false;
        if (show && genderFilterHome && genderCell && genderCell.innerText.trim() !== genderFilterHome) show = false;
        if (show && (dateFrom || dateTo)) {
          const dateStr = dateCell.innerText.trim();
          if (dateStr) {
            const rowDate = new Date(dateStr);
            const fromDate = dateFrom ? new Date(dateFrom) : null;
            const toDate = dateTo ? new Date(dateTo) : null;
            if (fromDate && rowDate < fromDate) show = false;
            if (show && toDate && rowDate > toDate) show = false;
          } else {
            show = false;
          }
        }
      }
    }
    row.style.display = show ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', function() {
  onAuthStateChanged(auth, async (user) => {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (!user) {
      if (currentPath !== 'index.html') {
        window.location.href = 'index.html';
      }
      return;
    }
    if (currentPath !== 'index.html') {
      const role = await getUserRole(user);
      currentUserRole = role;
      updateSidebarForRole(role);
      updateTopBarForRole(user);
    }
  });
  if (window.location.pathname.includes('home.html') || 
      window.location.pathname.includes('admin.html')) {
    loadStudents();
  }
  if (window.location.pathname.includes('clearanceTracking.html')) {
    loadClearanceLogs();
  }
  if (window.location.pathname.includes('registrationPage.html') || 
      window.location.pathname.includes('admin.html')) {
    loadPrograms();
  }
  attachSortListeners();
  if (document.getElementById('date')) setDefaultDate();
  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
    populateProgramDropdown(); 
  }
  if (window.location.pathname.includes('statusupdate.html')) {
    enableStatusUpdateHoverScroll();
  }
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); login(); }
    });
  }
  if (window.location.pathname.includes('statusupdate.html')) {
    const rfidInput = document.getElementById('rfidSearch');
    if (rfidInput) {
      rfidInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); searchStudent(); }
      });
    }
  }
  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
    populateProgramDropdown();
    populateAcademicYearDropdown();
  }
  loadDarkModePreference();
  initializeDateFilters();
  function setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'home.html';
    const navLinks = document.querySelectorAll('.sidebar .nav');
    navLinks.forEach(link => {
      link.classList.remove('active');
      const onclick = link.getAttribute('onclick') || '';
      if (onclick.includes('goHome()') && path === 'home.html') link.classList.add('active');
      if (onclick.includes('goRegister()') && path === 'registrationPage.html') link.classList.add('active');
      if (onclick.includes('goStatusUpdate()') && path === 'statusupdate.html') link.classList.add('active');
      if (onclick.includes('goAdmin()') && path === 'admin.html') link.classList.add('active');
      if (onclick.includes('goRegistered()') && path === 'clearanceTracking.html') link.classList.add('active');
    });
  }
  setActiveNav();
  if (window.location.pathname.includes('registrationPage.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const rfid = urlParams.get('rfid');
    if (rfid) {
      setupEditMode(rfid);
    } else {
      resetRegistrationForm();
    }
    let tamperInterval = setInterval(checkFieldIntegrity, 2000);
    function checkFieldIntegrity() {
      const fieldsToCheck = [
        'surname', 'firstName', 'middleName',
        'program', 'yearLevel', 'gender'
      ];
      for (let id of fieldsToCheck) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dataField = el.getAttribute('data-field');
        if (!dataField || dataField !== id) {
          triggerTamperAlert();
          return;
        }
      }
      const regBtn = document.getElementById('registerButton');
      if (regBtn && regBtn.getAttribute('onclick') !== 'validateAndRegister()' &&
                     regBtn.getAttribute('onclick') !== 'validateAndUpdate()') {
        triggerTamperAlert();
      }
    }
    if (rfid) {
      document.querySelectorAll('input[name="regType"]').forEach(radio => radio.disabled = true);
      document.getElementById('newStudentFields').style.display = 'block';
    }
    function triggerTamperAlert() {
      clearInterval(tamperInterval);
      showMessageModal('I know what you did there blud...');
      document.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }
    window.addEventListener('beforeunload', function() {
      clearInterval(tamperInterval);
    });
  }
  document.addEventListener('click', function(e) {
    const th = e.target.closest('th');
    if (!th) return;
    const table = th.closest('table');
    if (!table) return;
    if (table.id === 'adminStudentsTable') {
      const index = Array.from(th.parentNode.children).indexOf(th);
      if (index >= 0 && index <= 6) {
        handleAdminSort(index);
      }
    } else if (table.id === 'programsTable') {
      const index = Array.from(th.parentNode.children).indexOf(th);
      if (index === 0 || index === 1) {
        handleProgramSort(index);
      }
    }
  });
});

function clearFilters() {
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
  const acadYearFilter = document.getElementById('acadYearFilter');
  if (acadYearFilter) acadYearFilter.value = '';
  const dateFrom = document.getElementById('dateFrom');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('dateTo');
  if (dateTo) dateTo.value = '';
  const dateFromHome = document.getElementById('dateFromHome');
  if (dateFromHome) dateFromHome.value = '';
  const dateToHome = document.getElementById('dateToHome');
  if (dateToHome) dateToHome.value = '';
  const courseFilterHome = document.getElementById('courseFilter');
  if (courseFilterHome) courseFilterHome.value = '';
  const yearFilterHome = document.getElementById('yearFilter');
  if (yearFilterHome) yearFilterHome.value = '';
  const acadYearFilterHome = document.getElementById('acadYearFilterHome');
  if (acadYearFilterHome) acadYearFilterHome.value = '';
  const genderFilterHome = document.getElementById('genderFilterHome');
  if (genderFilterHome) genderFilterHome.value = '';
  applyFilters();
}

function refreshTable() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const isStatusUpdate = window.location.pathname.includes('statusupdate.html');
  if (isStatusUpdate && currentStudentForUpdate) {
    if (!confirm('Refreshing will clear the current student details. Continue?')) {
      return;
    }
    document.getElementById('studentResult').style.display = 'none';
    currentStudentForUpdate = null;
  }
  if (isLogTable) {
    loadClearanceLogs();
  } else {
    loadStudents();
  }
}

function clearStatusUpdate() {
  document.getElementById('rfidSearch').value = '';
  document.getElementById('studentResult').style.display = 'none';
  currentStudentForUpdate = null;
}

function updateSelectAllHomeState() {
  const selectAll = document.getElementById('selectAllHome');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#homeTable tbody .home-checkbox');
  selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}
function toggleSelectAllHome(selectAllCheckbox) {
  const checkboxes = document.querySelectorAll('#homeTable tbody .home-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateSelectAllHomeState();
}

function toggleSelectAllLogs(checkbox) {
  const checkboxes = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateSelectAllLogsState();
}

function updateSelectAllLogsState() {
  const selectAll = document.getElementById('selectAllLogs');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox');
  selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}

function getProgramFullName(code) {
  if (!code) return '';
  if (!programs || programs.length === 0) {
    console.warn('Programs not loaded yet');
    return code;
  }
  const program = programs.find(p => p.programCode === code);
  return program ? program.programName : code;
}

function deleteSelectedLogs() {
  const selected = document.querySelectorAll('#clearanceLogTable tbody .log-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one log to delete.');
    return;
  }
  pendingDeleteLogIds = Array.from(selected).map(cb => cb.getAttribute('data-log-id'));
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete ${selected.length} selected log(s)?`;
  document.getElementById('confirmModal').style.display = 'flex';
}

async function confirmDeleteLogs() {
  const ids = [...pendingDeleteLogIds];
  closeConfirmModal();
  try {
    const promises = ids.map(id => deleteDoc(doc(db, 'clearanceLogs', id)));
    await Promise.all(promises);
    loadClearanceLogs();
    showMessageModal('Selected logs deleted.');
  } catch (err) {
    showMessageModal('Delete failed: ' + err.message);
  } finally {
    pendingDeleteLogIds = [];
  }
}

function showHelpModal() { document.getElementById('helpModal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('helpModal').style.display = 'none'; }
function showLogoutModal() { document.getElementById('logoutModal').style.display = 'flex'; }
function closeLogoutModal() { document.getElementById('logoutModal').style.display = 'none'; }
function showExportModal() { document.getElementById('exportModal').style.display = 'flex'; }
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }
function exportChosen(type) { closeExportModal(); exportData(type); }

function showPrintDialog(headers, rows, title, filterInfo = {}) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { margin: 0.2in; size: auto; }
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .header { text-align: center; margin-bottom: 20px; }
        h1 { font-size: 16pt; margin: 0.15in 0 0 0; font-weight: bold; text-transform: none; }
        h2 { font-family: 'Times New Roman', Times, serif; font-size: 12pt; margin: 5px 0; font-weight: bold; text-transform: uppercase; }
        .filter-info { font-family: 'Times New Roman', Times, serif; margin: 5px 0; font-size: 11pt; }
        .course-info { font-family: 'Times New Roman', Times, serif; margin: 5px 0; font-size: 12pt; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 8pt; page-break-inside: auto; }
        th, td { border: 1px solid #000; padding: 2px 1px; text-align: center; word-wrap: break-word; }
        th { background-color: #f0f0f0; font-weight: bold; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>St. Mary's College of Meycauayan, Inc.<br>Meycauayan, Bulacan</h1>
        <h2>${title}</h2>
  `);
  const filterParts = [];
  if (filterInfo.acadYear) filterParts.push('S.Y. ' + filterInfo.acadYear);
  if (filterInfo.semester) filterParts.push(filterInfo.semester + ' Sem');
  if (filterInfo.year) filterParts.push(filterInfo.year + ' Year');
  if (filterInfo.gender) filterParts.push(filterInfo.gender);
  if (filterInfo.remarks) filterParts.push(filterInfo.remarks);
  if (filterInfo.status) filterParts.push(filterInfo.status);
  if (filterParts.length > 0) {
    doc.write(`<div class="filter-info">${filterParts.join(' | ')}</div>`);
  }
  if (filterInfo.courseFull) {
    doc.write(`<div class="course-info">${filterInfo.courseFull}</div>`);
  } else if (filterInfo.course) {
    doc.write(`<div class="course-info">${filterInfo.course}</div>`);
  }
  doc.write('</div>');
  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
  doc.write(`<tr>${thead}${tbody}</table>`);
  doc.write('</body></html>');
  doc.close();
  iframe.onload = function() {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => { document.body.removeChild(iframe); }, 1000);
  };
}

// ==================== LOGIN (FIXED VERIFICATION MESSAGE) ====================
async function login() {
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  if (email === '' || password === '') {
    showMessageModal('Please enter email and password');
    return;
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    if (!user.emailVerified) {
      // Fixed: use innerHTML to show line break properly
      showMessageModal('Please verify your email before logging in. Check your inbox.<br>If you did not receive the email, please check your spam folder.');
      await signOut(auth);
      return;
    }
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      showMessageModal('User record not found. Please register again.');
      await signOut(auth);
      return;
    }
    const userData = userDoc.data();
    const role = userData.role || 'user';
    const approved = userData.approved;
    if (role === 'user' && approved !== true) {
      showMessageModal('Your account is pending approval by superadmin. Please wait.');
      await signOut(auth);
      return;
    }
    if (role === 'user') {
      window.location.href = 'registrationPage.html';
    } else {
      window.location.href = 'home.html';
    }
  } catch (err) {
    if (err.code === 'auth/invalid-credential') {
      document.getElementById('errorModal').style.display = 'flex';
    } else if (err.code === 'auth/too-many-requests') {
      showMessageModal('Too many failed login attempts. Please try again later.');
    } else {
      console.error('Login error:', err);
      showMessageModal('Login failed: ' + err.message);
    }
  }
}

function logout() { showLogoutModal(); }

async function confirmLogout() {
  closeLogoutModal();
  try {
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout error:', err);
    showMessageModal('Logout failed: ' + err.message);
  }
}

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

function needHelp() { showHelpModal(); }
function goHome() { window.location.href = 'home.html'; }
function goRegister() { window.location.href = 'registrationPage.html'; }
function goStatusUpdate() { window.location.href = 'statusupdate.html'; }
function goRegistered() { window.location.href = 'clearanceTracking.html'; }
function goAdmin() { window.location.href = 'admin.html'; }

function showForgotPasswordModal() {
  document.getElementById('resetEmail').value = '';
  document.getElementById('forgotPasswordModal').style.display = 'flex';
}
function closeForgotPasswordModal() {
  document.getElementById('forgotPasswordModal').style.display = 'none';
}
async function sendPasswordReset() {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) {
    showMessageModal('Please enter your email.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessageModal('Password reset email sent. Check your inbox and spam folder.');
    closeForgotPasswordModal();
    document.getElementById('resetEmail').value = '';
  } catch (err) {
    if (err.code === 'auth/invalid-email') {
      showMessageModal('The email address is not valid.');
    } else if (err.code === 'auth/user-not-found') {
      showMessageModal('No account found with this email address.');
    } else if (err.code === 'auth/too-many-requests') {
      showMessageModal('Too many requests. Please try again later.');
    } else {
      showMessageModal('Error: ' + err.message);
    }
  }
}

function checkSuperAdmin() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || userDoc.data().role !== 'superadmin') {
        showMessageModal('Access denied.');
        setTimeout(() => window.location.href = 'home.html', 1500);
      }
    } catch (err) {
      console.error('Error checking role:', err);
      showMessageModal('Error verifying access.');
      setTimeout(() => window.location.href = 'home.html', 1500);
    }
  });
}

function checkAdmin() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || (userDoc.data().role !== 'admin' && userDoc.data().role !== 'superadmin')) {
        showMessageModal('Access denied.');
        setTimeout(() => window.location.href = 'home.html', 1500);
      }
    } catch (err) {
      console.error('Error checking role:', err);
      showMessageModal('Error verifying access.');
      setTimeout(() => window.location.href = 'home.html', 1500);
    }
  });
}

async function updateTopBarForRole(user) {
  if (!user) {
    document.getElementById('helpText').innerText = 'NEED HELP';
    const helpIcon = document.querySelector('.help-icon');
    if (helpIcon) helpIcon.innerHTML = '?';
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const role = userDoc.data().role;
      const helpText = document.getElementById('helpText');
      const helpIcon = document.querySelector('.help-icon');
      if (role === 'superadmin') {
        helpText.innerText = 'ITC';
        helpIcon.innerHTML = 'I';
      } else if (role === 'admin') {
        helpText.innerText = 'ADMIN';
        helpIcon.innerHTML = '?';
      } else {
        helpText.innerText = 'USER';
        helpIcon.innerHTML = '?';
      }
    } else {
      document.getElementById('helpText').innerText = 'NEED HELP';
      const helpIcon = document.querySelector('.help-icon');
      if (helpIcon) helpIcon.innerHTML = '?';
    }
  } catch (err) {
    console.error('Error fetching role for top bar:', err);
    document.getElementById('helpText').innerText = 'NEED HELP';
    const helpIcon = document.querySelector('.help-icon');
    if (helpIcon) helpIcon.innerHTML = '?';
  }
}
function handleHelpClick() {
  if (currentUserRole === 'superadmin') {
    window.location.href = 'superadmin.html';
  } else {
    showHelpModal();
  }
}

async function saveFileWithPicker(blob, suggestedName) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'Spreadsheet',
          accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv']
          }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        return true;
      }
      console.log('Save picker failed, falling back', err);
      return false;
    }
  }
  return false;
}

async function exportData(type) {
  if (!type) return;
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const isHome = window.location.pathname.includes('home.html');
  let table = null;
  if (isLogTable) {
    table = document.getElementById('clearanceLogTable');
  } else if (isHome) {
    table = document.getElementById('homeTable');
  } else {
    return;
  }
  if (!table) return;
  const clone = table.cloneNode(true);
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  for (let i = clonedTBody.rows.length - 1; i >= 0; i--) {
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }
  if (isLogTable) {
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) {
      headerRow.deleteCell(0);
      if (headerRow.cells.length > 0) headerRow.deleteCell(0);
    }
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0);
        if (row.cells.length > 0) row.deleteCell(0);
      }
    });
  } else if (isHome) {
    const headerRow = clone.querySelector('thead tr');
    if (headerRow) {
      headerRow.deleteCell(0);
      if (headerRow.cells.length > 0) headerRow.deleteCell(0);
    }
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0);
        if (row.cells.length > 0) row.deleteCell(0);
      }
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
      tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = { alignment: { horizontal: 'center', vertical: 'center' } };
      }
    }
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
    const wbdata = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbdata], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = isLogTable ? 'clearance_logs.xlsx' : 'students.xlsx';
    const usedPicker = await saveFileWithPicker(blob, filename);
    if (!usedPicker) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } else if (type === 'pdf') {
    const headers = [];
    const thead = clone.querySelector('thead tr');
    if (thead) {
      thead.querySelectorAll('th').forEach(th => {
        let text = th.innerText.trim();
        if (text === 'SEMESTER') text = 'SEM';
        else if (text === 'YEAR LEVEL') text = 'YEAR';
        headers.push(text);
      });
    }
    if (isLogTable && headers.length > 4) {
      headers[4] = "A.Y.";
    }
    const bodyRows = [];
    clone.querySelectorAll('tbody tr').forEach(tr => {
      const row = [];
      tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
      bodyRows.push(row);
    });
    const title = isLogTable ? 'Clearance Logs' : 'Student List';
    const filterInfo = {};
    if (isLogTable) {
      filterInfo.acadYear = document.getElementById('acadYearFilter')?.value || '';
      filterInfo.semester = document.getElementById('semesterFilter')?.value || '';
      filterInfo.year = document.getElementById('yearFilterLogs')?.value || '';
      const courseCode = document.getElementById('courseFilterLogs')?.value || '';
      filterInfo.courseFull = getProgramFullName(courseCode);
      filterInfo.remarks = document.getElementById('remarksFilter')?.value || '';
      filterInfo.status = document.getElementById('statusFilter')?.value || '';
    } else {
      const courseCode = document.getElementById('courseFilter')?.value || '';
      filterInfo.courseFull = getProgramFullName(courseCode);
      filterInfo.year = document.getElementById('yearFilter')?.value || '';
      filterInfo.acadYear = document.getElementById('acadYearFilterHome')?.value || '';
      filterInfo.gender = document.getElementById('genderFilterHome')?.value || '';
    }
    showPrintDialog(headers, bodyRows, title, filterInfo);
  } else if (type === 'csv') {
    const rows = [];
    const thead = clone.querySelector('thead tr');
    if (thead) {
      const headerRow = [];
      thead.querySelectorAll('th').forEach(th => headerRow.push(th.innerText.trim()));
      rows.push(headerRow);
    }
    clone.querySelectorAll('tbody tr').forEach(tr => {
      const row = [];
      tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
      rows.push(row);
    });
    const csvContent = rows.map(row =>
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = isLogTable ? 'clearance_logs.csv' : 'students.csv';
    const usedPicker = await saveFileWithPicker(blob, filename);
    if (!usedPicker) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}