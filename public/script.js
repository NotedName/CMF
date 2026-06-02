// ==================== GLOBAL VARIABLES ====================
let allStudents = [];                                     // main student data array
let clearanceLogs = [];                                   // main clearance logs array
let programs = [];                                        // new: store programs
let pendingDeleteRfids = [];                              // for home page delete confirmation               
let homeSort = { column: 3, direction: 'asc' };           // default sort by Name (index 2, after adding checkbox column)
let logSort = { column: 2, direction: 'asc' };            // default sort by Student Name (index 2)    
let isEditMode = false;                                   // for registration page edit mode
let currentStudentForUpdate = null;                       // store current student data when in edit mode
let isProcessing = false;                                 // to prevent multiple simultaneous operations
let pendingAdminDelete = [];                              // for admin delete confirmation
let adminStudentSort = { column: 1, direction: 'asc' };   // default sort by Name (index 1)
let programSort = { column: 0, direction: 'asc' };        // default sort by Program Code
let pendingDeleteProgramId = null;                        // for program delete confirmation    
let users = [];                                           // for superadmin user management   
let filteredUsers = [];                                   // for user table filtering
let pendingUserAction = null;                             // { uid, action, newRole? } for confirm modal      
let userSort = { column: 0, direction: 'asc' };           // default sort by Email
let pendingDeleteLogIds = [];                             // for clearance logs delete confirmation

// ==================== GLOBAL ENTER KEY HANDLER FOR MODALS ====================
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    // Find any visible modal (with display: flex)
    const visibleModal = Array.from(document.querySelectorAll('.modal')).find(modal => 
      window.getComputedStyle(modal).display === 'flex'
    );
    if (visibleModal) {
      // If the active element is not an input, select, textarea, or button (to avoid interfering with form inputs)
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA' || active.tagName === 'BUTTON');
      if (!isInput) {
        // Find the first button inside the modal and click it (usually Yes/OK)
        const firstButton = visibleModal.querySelector('button');
        if (firstButton) {
          e.preventDefault(); // Prevent any default action (like form submission)
          firstButton.click();
        }
      }
      // If an input is focused, we let the default behavior happen (e.g., form submission, which is handled elsewhere)
    }
  }
});

let currentUserRole = null;

/**
 * Fetch the role of the currently authenticated user from Firestore.
 * @param {Object} user - Firebase user object
 * @returns {Promise<string|null>} role ('user', 'admin', 'superadmin') or null
 */
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

/**
 * Check if the current user has one of the allowed roles.
 * Redirects to the appropriate default page if not allowed.
 * Also updates the sidebar visibility based on the role.
 * @param {Array<string>} allowedRoles - e.g. ['admin', 'superadmin']
 * @returns {Promise<string>} the user's role
 */
async function checkPageAccess(allowedRoles) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      const role = await getUserRole(user);
      if (!role || !allowedRoles.includes(role)) {
        // Redirect to the default page for the actual role
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
      updateTopBarForRole(user);   // <-- ensure top‑bar shows correct role
      resolve(role);
    });
  });
}

/**
 * Show/hide sidebar navigation items according to the user's role.
 * @param {string} role - 'user', 'admin', or 'superadmin'
 */
// ==================== SIDEBAR VISIBILITY / DISABLED STATE ====================
function updateSidebarForRole(role) {
  console.log('updateSidebarForRole called with role:', role);
  const navItems = document.querySelectorAll('.sidebar .nav');
  console.log('Found nav items:', navItems.length);

  if (role === 'user') {
    navItems.forEach(item => {
      const onclick = item.getAttribute('onclick') || '';
      if (onclick.includes('goRegister()')) {
        item.classList.remove('hidden');
        // Fallback: ensure it's visible
        item.style.display = 'flex';
      } else {
        item.classList.add('hidden');
        // Fallback: directly hide
        item.style.display = 'none';
      }
    });
  } else {
    navItems.forEach(item => {
      item.classList.remove('hidden');
      item.style.display = 'flex'; // restore default display
    });
  }
}

// ==================== CHECK DUPLICATE STUDENT NUMBER ====================
async function isStudentNumberDuplicate(studentNumber, excludeRfid = null) {
  const q = query(collection(db, 'students'), where('studentNumber', '==', studentNumber));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return false;
  // If excludeRfid is provided, ignore that document (for updates)
  if (excludeRfid) {
    return snapshot.docs.some(doc => doc.id !== excludeRfid);
  }
  return true;
}

// ==================== UPDATE STUDENTS' PROGRAM ====================
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

// ==================== PAGE INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname.includes('home.html') || 
      window.location.pathname.includes('admin.html')) {
    loadStudents();
  }

  // After Firebase is initialized, listen for auth state changes
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

    // ---------- Tampering detection ----------
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

    function triggerTamperAlert() {
      clearInterval(tamperInterval);
      showMessageModal('I know what you did there blud...');
      document.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }

    window.addEventListener('beforeunload', function() {
      clearInterval(tamperInterval);
    });
    // ---------- END tampering detection ----------
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

// ==================== SPINNER HELPERS ====================
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

// ==================== HOVER SCROLL ====================
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

// ==================== DATA FETCHING ====================
async function loadStudents() {
  if (document.getElementById('homeTable')) showTableSpinner('#homeTable');
  try {
    const q = query(collection(db, 'students'), orderBy('dateTime', 'desc'));
    const querySnapshot = await getDocs(q);
    allStudents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (document.getElementById('homeTable')) {
      renderHomeTable(allStudents, true);
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

// ==================== PROGRAM MANAGEMENT ====================
async function loadPrograms() {
  // Show spinner only on admin page
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
  let code = document.getElementById('newProgramCode').value.trim();
  let name = document.getElementById('newProgramName').value.trim();

  if (!code || !name) {
    showMessageModal('Please enter both code and name.');
    return;
  }

  // Format program name
  name = formatProgramName(name);

  if (!/^[A-Za-z]+$/.test(code)) {
    showMessageModal('Program code must contain only letters (no spaces, numbers, or symbols).');
    return;
  }

  code = code.toUpperCase();

  if (programs.some(p => p.programCode.toUpperCase() === code)) {
    showMessageModal(`Program code "${code}" already exists.`);
    return;
  }

  try {
    await addDoc(collection(db, 'programs'), { programCode: code, programName: name });
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

  // Format program name
  name = formatProgramName(name);

  if (!/^[A-Za-z]+$/.test(code)) {
    showMessageModal('Program code must contain only letters (no spaces, numbers, or symbols).');
    return;
  }

  code = code.toUpperCase();

  const duplicate = programs.some(p => p.id !== id && p.programCode.toUpperCase() === code);
  if (duplicate) {
    showMessageModal(`Program code "${code}" already exists.`);
    return;
  }

  try {
    await updateDoc(doc(db, 'programs', id), { programCode: code, programName: name });
    
    if (oldCode !== code) {
      await updateStudentsProgram(oldCode, code);
    }
    
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
  } else if (pendingDeleteLogIds.length > 0) {          // <-- new
    await confirmDeleteLogs();
  } else if (pendingAdminDelete.length > 0) {
    await confirmAdminDelete();
  } else if (pendingDeleteProgramId) {
    await confirmProgramDelete();
  } else if (pendingUserAction) {
    const { uid, action, newRole } = pendingUserAction;
    closeConfirmModal(); // hide modal
    try {
      if (action === 'approve') {
        await updateDoc(doc(db, 'users', uid), { approved: true });
        showMessageModal('User approved.');
      } else if (action === 'delete') {
        await deleteDoc(doc(db, 'users', uid));
        showMessageModal('User deleted from Firestore.');
      } else if (action === 'updateRole') {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
        showMessageModal('Role updated.');
      }
      loadUsers(); // refresh table
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

// ==================== USER MANAGEMENT (SUPERADMIN) ====================
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

function renderUsersTable() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = filteredUsers.map(user => {
    const approved = user.approved ? 'Yes' : 'No';
    const createdAt = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString() : '';
    return `
      <tr>
        <td>${user.email || ''}</td>
        <td>${user.role || 'user'}</td>
        <td>${approved}</td>
        <td>${createdAt}</td>
        <td>
          ${!user.approved ? `<button onclick="showApproveConfirm('${user.uid}')" class="export-btn" style="margin-right:5px;">Approve</button>` : ''}
          <select id="role-${user.uid}" style="margin-right:5px; height:30px;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
          </select>
          <button onclick="showUpdateRoleConfirm('${user.uid}')" class="export-btn" style="margin-right:5px;">Update</button>
          <button onclick="showDeleteConfirm('${user.uid}')" class="delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filter functions
function filterUsersTable() {
  const search = document.getElementById('userSearch')?.value.toLowerCase() || '';
  const roleFilter = document.getElementById('roleFilter')?.value || '';
  const approvedFilter = document.getElementById('approvedFilter')?.value || '';

  filteredUsers = users.filter(user => {
    if (search && !user.email.toLowerCase().includes(search)) return false;
    if (roleFilter && user.role !== roleFilter) return false;
    if (approvedFilter === 'yes' && !user.approved) return false;
    if (approvedFilter === 'no' && user.approved) return false;
    return true;
  });
  sortUsers();               // <-- apply current sort
  renderUsersTable();
  updateUserSortIndicators();
}

function clearUserFilters() {
  document.getElementById('userSearch').value = '';
  document.getElementById('roleFilter').value = '';
  document.getElementById('approvedFilter').value = '';
  filterUsersTable();
}

// Confirmation modals
function showApproveConfirm(uid) {
  pendingUserAction = { uid, action: 'approve' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to approve this user? They will be able to log in.';
  document.getElementById('confirmModal').style.display = 'flex';
}

function showDeleteConfirm(uid) {
  pendingUserAction = { uid, action: 'delete' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to delete this user from Firestore? (Authentication account will remain.)';
  document.getElementById('confirmModal').style.display = 'flex';
}

function showUpdateRoleConfirm(uid) {
  const select = document.getElementById(`role-${uid}`);
  const newRole = select.value;
  pendingUserAction = { uid, action: 'updateRole', newRole };
  document.getElementById('confirmMessage').innerText = `Are you sure you want to change this user's role to ${newRole}?`;
  document.getElementById('confirmModal').style.display = 'flex';
}

function handleUserSort(columnIndex) {
  if (userSort.column === columnIndex) {
    userSort.direction = userSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    userSort.column = columnIndex;
    userSort.direction = 'asc';
  }
  // Re-render the table with sorted data
  sortUsers();
  renderUsersTable();
  updateUserSortIndicators();
}

function sortUsers() {
  if (!filteredUsers.length) return;
  const prop = getUserSortProperty(userSort.column);
  filteredUsers.sort((a, b) => {
    let valA, valB;
    if (prop === 'createdAt') {
      valA = a.createdAt ? a.createdAt.seconds : 0;
      valB = b.createdAt ? b.createdAt.seconds : 0;
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
    0: 'email',
    1: 'role',
    2: 'approved',
    3: 'createdAt'
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
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
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
          <button onclick="editStudent('${student.rfidNumber}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Edit</button>
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

function editStudent(rfid) {
  window.location.href = `registrationPage.html?rfid=${encodeURIComponent(rfid)}`;
}

async function confirmAdminDelete() {
  const rfids = [...pendingAdminDelete];
  closeConfirmModal();
  try {
    const promises = rfids.map(rfid => deleteDoc(doc(db, 'students', rfid)));
    await Promise.all(promises);
    loadStudents();           // reload students for both tables
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

// ==================== ADMIN FILTER FUNCTIONS ====================
function filterAdminTable() {
  const searchValue = document.getElementById('adminSearch')?.value.toLowerCase() || '';
  const table = document.getElementById('adminStudentsTable');
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    // Search in all text columns except the last (Actions)
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

// ==================== PROGRAM FILTER FUNCTIONS ====================
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

// ==================== RENDERING HOME TABLE ====================
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
          <input type="checkbox" class="home-checkbox" data-rfid="${student.rfidNumber}" onchange="updateSelectAllHomeState()">
        </td>
        <td>${student.rfidNumber || ''}</td>
        <td>${student.studentNumber || ''}</td>
        <td>${fullName}</td>
        <td>${student.program || ''}</td>
        <td>${student.yearLevel || ''}</td>
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
  const rfid = selected[0].getAttribute('data-rfid');
  window.location.href = `registrationPage.html?rfid=${encodeURIComponent(rfid)}`;
}

function deleteSelectedHome() {
  const selected = document.querySelectorAll('#homeTable tbody .home-checkbox:checked');
  if (selected.length === 0) {
    showMessageModal('Please select at least one student to delete.');
    return;
  }
  pendingDeleteRfids = Array.from(selected).map(cb => cb.getAttribute('data-rfid'));
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

// ==================== RENDERING CLEARANCE LOGS TABLE ====================
function renderClearanceLogs(logs, keepSort = false) {
  const tbody = document.querySelector('#clearanceLogTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortLogs(logs, logSort.column, logSort.direction) : logs;
  tbody.innerHTML = data.map(log => {
    const status = log.status || '';
    const releaseDate = log.claimedDate ? new Date(log.claimedDate.seconds * 1000).toLocaleString() : '';
    const receiveDate = log.returnedDate ? new Date(log.returnedDate.seconds * 1000).toLocaleString() : '';
    const remarks = log.remarks || '';
    const academicYear = log.academicYear || '';
    const semester = log.semester || '';
    const idNumber = log.studentNumber || '';
    const name = log.name || '';
    const program = log.program || '';          // <-- new
    const yearLevel = log.yearLevel || '';      // <-- new
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
        <td>${status}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

// ==================== SORTING ====================
function getSortProperty(columnIndex, isLogTable) {
  if (isLogTable) {
    // Column indices: 0=checkbox, 1=rfid, 2=id, 3=name, 4=release, 5=receive, 6=ay, 7=sem, 8=year, 9=course, 10=remarks, 11=status
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
    // New column order: 0: checkbox, 1: rfid, 2: studentNumber, 3: name, 4: program, 5: yearLevel, 6: gender, 7: date
    const map = {
      0: 'rfid', 1: 'studentNumber', 2: 'name', 3: 'claimedDate', 4: 'returnedDate',
      5: 'academicYear', 6: 'semester', 7: 'yearLevel', 8: 'program',
      9: 'remarks', 10: 'status'
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
      if (index === 0) return; // Skip checkbox column
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
}

// ==================== HARD DELETE SELECTED (HOME) ====================
function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
}

// ==================== EDIT SELECTED (HOME) ====================
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
  const rfid = selected[0].getAttribute('data-rfid');
  window.location.href = `registrationPage.html?rfid=${encodeURIComponent(rfid)}`;
}

// ==================== RFID AUTO‑FILL ====================
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
      document.getElementById('surname').disabled = false;
      document.getElementById('firstName').disabled = false;
      document.getElementById('middleName').disabled = false;
      document.getElementById('studentNumber').disabled = false;
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

// ==================== REGISTRATION PAGE EDIT MODE ====================
async function setupEditMode(rfid) {
  try {
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found. Redirecting...');
      setTimeout(() => window.location.href = 'home.html', 1500);
      return;
    }
    const student = docSnap.data();

    document.getElementById('rfidNumber').value = student.rfidNumber || '';
    document.querySelector('[data-field="surname"]').value = student.surname || '';
    document.querySelector('[data-field="firstName"]').value = student.firstName || '';
    document.querySelector('[data-field="middleName"]').value = student.middleName || '';
    document.querySelector('[data-field="program"]').value = student.program || '';
    document.querySelector('[data-field="yearLevel"]').value = student.yearLevel || '';
    document.getElementById('studentNumber').value = student.studentNumber || '';
    if (student.dateTime) {
      const datePart = student.dateTime.split(' ')[0];
      document.getElementById('date').value = datePart;
    }
    document.querySelector('[data-field="gender"]').value = student.gender || '';

    document.getElementById('rfidNumber').disabled = true;
    document.getElementById('studentNumber').disabled = true;
    document.getElementById('date').disabled = true;

    document.querySelector('[data-field="surname"]').disabled = false;
    document.querySelector('[data-field="firstName"]').disabled = false;
    document.querySelector('[data-field="middleName"]').disabled = false;
    document.querySelector('[data-field="program"]').disabled = false;
    document.querySelector('[data-field="yearLevel"]').disabled = false;
    document.querySelector('[data-field="gender"]').disabled = false;

    const btn = document.getElementById('registerButton');
    btn.textContent = 'UPDATE';
    btn.onclick = validateAndUpdate;
    isEditMode = true;
  } catch (err) {
    console.error('Edit setup error:', err);
    showMessageModal('Error loading student data.');
  }
}

// ==================== UPDATE STUDENT (with confirmation) ====================
async function validateAndUpdate() {
  clearAllFieldErrors();
  formatAllNameFields();

  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    surname: document.querySelector('[data-field="surname"]').value.trim(),
    firstName: document.querySelector('[data-field="firstName"]').value.trim(),
    middleName: document.querySelector('[data-field="middleName"]').value.trim(),
    program: document.querySelector('[data-field="program"]').value,
    yearLevel: document.querySelector('[data-field="yearLevel"]').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
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
  if (!formData.date) { showFieldError('date'); hasErrors = true; }
  if (!formData.gender) { showFieldError('gender'); hasErrors = true; }
  
  if (hasErrors) {
    showMessageModal('Please fill in all required fields.');
    return;
  }

  // Check for duplicate student number (excluding current student)
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
    const docRef = doc(db, 'students', formData.rfidNumber);
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
      studentNumber: formData.studentNumber,
      gender: formData.gender,
    };

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

// ==================== REGISTRATION (NEW) ====================
async function validateAndRegister() {
  clearAllFieldErrors();
  formatAllNameFields();

  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    surname: document.querySelector('[data-field="surname"]').value.trim(),
    firstName: document.querySelector('[data-field="firstName"]').value.trim(),
    middleName: document.querySelector('[data-field="middleName"]').value.trim(),
    program: document.querySelector('[data-field="program"]').value,
    yearLevel: document.querySelector('[data-field="yearLevel"]').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
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
  if (!formData.date) { showFieldError('date'); hasErrors = true; }
  if (!formData.gender) { showFieldError('gender'); hasErrors = true; }
  if (hasErrors) return;

  // Check for duplicate student number
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
  document.getElementById('date').value = '';
  
  const program = document.getElementById('program');
  if (program) program.selectedIndex = 0;
  
  const year = document.getElementById('yearLevel');
  if (year) year.selectedIndex = 0;
  
  const gender = document.getElementById('gender');
  if (gender) gender.selectedIndex = 0;
  
  document.getElementById('rfidNumber').disabled = false;
  document.getElementById('surname').disabled = false;
  document.getElementById('firstName').disabled = false;
  document.getElementById('middleName').disabled = false;
  document.getElementById('studentNumber').disabled = false;
  document.getElementById('date').disabled = false;
  
  const btn = document.getElementById('registerButton');
  btn.textContent = 'REGISTER';
  btn.onclick = validateAndRegister;
  isEditMode = false;
  clearAllFieldErrors();
  setDefaultDate();
}

function clearRegistrationForm() {
  if (isEditMode) {
    // Clear only editable fields
    document.querySelector('[data-field="surname"]').value = '';
    document.querySelector('[data-field="firstName"]').value = '';
    document.querySelector('[data-field="middleName"]').value = '';
    
    const program = document.querySelector('[data-field="program"]');
    if (program) program.selectedIndex = 0;
    
    const gender = document.querySelector('[data-field="gender"]');
    if (gender) gender.selectedIndex = 0;
    
    clearAllFieldErrors();
  } else {
    resetRegistrationForm();
  }
}

// ==================== REGISTRATION PAGE REFRESH ====================
function refreshRegistrationForm() {
  resetRegistrationForm();
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

// ==================== NAME FORMATTING ====================
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
  // Convert to lowercase first, then capitalize first letter of each word
  return str.toLowerCase().replace(/(^|\s)([a-z])/g, (match, separator, letter) => separator + letter.toUpperCase());
}

// ==================== STUDENT NUMBER FORMATTING & VALIDATION ====================
function formatStudentNumber(input) {
  // Remove any non-alphanumeric, convert to uppercase
  let val = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Ensure first character is a letter
  if (val.length > 0 && !/^[A-Z]$/.test(val[0])) {
    // If first character is not a letter, try to find the first letter and use that
    const firstLetterIndex = val.search(/[A-Z]/);
    if (firstLetterIndex >= 0) {
      val = val.slice(firstLetterIndex); // keep from first letter onward
    } else {
      val = ''; // no letter at all -> clear
    }
  }

  // After we have a leading letter, keep only digits after it
  if (val.length > 1) {
    const first = val[0];
    const rest = val.slice(1).replace(/[^0-9]/g, '');
    val = first + rest;
  }

  // Truncate to 7 characters max
  if (val.length > 7) val = val.slice(0, 7);

  input.value = val;
}

function isValidStudentNumber(studentNumber) {
  return /^[A-Z]\d{6}$/.test(studentNumber);
}

// ==================== STATUS UPDATE PAGE ====================
async function searchStudent() {
  const input = document.getElementById('rfidSearch').value.trim();
  if (!input) {
    showMessageModal('Please enter an RFID or Student Number.');
    return;
  }

  try {
    let student = null;

    // First try: treat input as RFID (document ID)
    const docRef = doc(db, 'students', input);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      student = docSnap.data();
    } else {
      // Second try: treat input as Student Number (field)
      const q = query(collection(db, 'students'), where('studentNumber', '==', input));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        // There should be only one because studentNumber is unique
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

  // Default values for dropdowns (instead of reading from student)
  const defaultRemarks = 'None';
  const currentYear = new Date().getFullYear();
  const defaultAcadYear = `${currentYear}-${currentYear + 1}`;
  const defaultSemester = '1st';

  // Build academic year options
  let acadOptions = '<option value="" disabled>Select Academic Year</option>';
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const acad = `${year}-${year + 1}`;
    const selected = (acad === defaultAcadYear) ? 'selected' : '';
    acadOptions += `<option value="${acad}" ${selected}>${acad}</option>`;
  }

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
            <option value="Graduating">Graduating</option>
            <option value="Moving Up">Moving Up</option>
            <option value="Transferring">Transferring</option>
          </select>
        </div>
        <div class="dropdown-item">
          <label>Academic Year</label>
          <select id="updateAcadYear" class="acad-select">
            ${acadOptions}
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

// ==================== CLEARANCE LOG HELPERS ====================
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
    program: student.program || '',          // <-- new
    yearLevel: student.yearLevel || '',      // <-- new
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

// ==================== RELEASE STUDENT (Claimed) ====================
async function releaseStudent(rfid) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newAcadYear = document.getElementById('updateAcadYear').value;
    const newSemester = document.getElementById('updateSemester').value;

    if (!newAcadYear || !newSemester) {
      showMessageModal('Please select Academic Year and/or Semester to proceed.');
      return;
    }
    if (!isValidAcademicYear(newAcadYear)) {
      showMessageModal('Academic Year must be in format YYYY-YYYY (e.g., 2025-2026).');
      return;
    }

    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const student = docSnap.data();

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
      newAcadYear,
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

// ==================== RECEIVE STUDENT (Returned) ====================
async function receiveStudent(rfid) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newAcadYear = document.getElementById('updateAcadYear').value;
    const newSemester = document.getElementById('updateSemester').value;

    if (!newAcadYear || !newSemester) {
      showMessageModal('Please select Academic Year and/or Semester to proceed.');
      return;
    }
    if (!isValidAcademicYear(newAcadYear)) {
      showMessageModal('Academic Year must be in format YYYY-YYYY (e.g., 2025-2026).');
      return;
    }

    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessageModal('Student not found.');
      return;
    }
    const student = docSnap.data();

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
      newAcadYear,
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
  const checkbox = event.target; // the checkbox that triggered the change

  if (checkbox.checked) {
    // Show password: remove the security style and set type to text
    passwordInput.style.removeProperty('-webkit-text-security');
    passwordInput.type = 'text';
  } else {
    // Hide password: restore the security style and keep type text
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

// ==================== POPULATE FILTERS ====================
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
  const remarksFilter = document.getElementById('remarksFilter');
  const courseFilter = document.getElementById('courseFilterLogs');
  const yearFilter = document.getElementById('yearFilterLogs');

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
}

// ==================== FILTERING ====================
let searchTimeout;
function applyFilters() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const tableId = isLogTable ? '#clearanceLogTable' : '#homeTable';
  const table = document.querySelector(tableId);
  if (!table) return;

  // Get filter values
  const searchInput = document.getElementById('search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  const semesterFilter = document.getElementById('semesterFilter')?.value || '';
  const remarksFilter = document.getElementById('remarksFilter')?.value || '';
  const courseFilterLogs = document.getElementById('courseFilterLogs')?.value || '';
  const yearFilterLogs = document.getElementById('yearFilterLogs')?.value || '';

  // Home page filters
  const courseFilterHome = document.getElementById('courseFilter')?.value || '';
  const yearFilterHome = document.getElementById('yearFilter')?.value || '';

  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;

    // Global search: check all text in the row
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }

    if (show) {
      if (isLogTable) {
        // Clearance logs table – new column indices:
        // 0:checkbox, 1:RFID, 2:ID, 3:NAME, 4:RELEASE, 5:RECEIVE, 6:A.Y., 7:SEMESTER,
        // 8:YEAR LEVEL, 9:COURSE, 10:REMARKS, 11:STATUS
        const statusCell = row.cells[11];
        const semesterCell = row.cells[7];
        const remarksCell = row.cells[10];
        const courseCell = row.cells[9];
        const yearCell = row.cells[8];

        if (statusFilter && statusCell && statusCell.innerText.trim() !== statusFilter) {
          show = false;
        }
        if (show && semesterFilter && semesterCell && semesterCell.innerText.trim() !== semesterFilter) {
          show = false;
        }
        if (show && remarksFilter && remarksCell && remarksCell.innerText.trim() !== remarksFilter) {
          show = false;
        }
        if (show && courseFilterLogs && courseCell && courseCell.innerText.trim() !== courseFilterLogs) {
          show = false;
        }
        if (show && yearFilterLogs && yearCell && yearCell.innerText.trim() !== yearFilterLogs) {
          show = false;
        }
      } else {
        // Home table – column indices (0:checkbox, 1:RFID, 2:STUDENT NO, 3:NAME,
        // 4:COURSE, 5:YEAR LEVEL, 6:GENDER, 7:DATE)
        const courseCell = row.cells[4];
        const yearCell = row.cells[5];

        if (courseFilterHome && courseCell && courseCell.innerText.trim() !== courseFilterHome) {
          show = false;
        }
        if (yearFilterHome && yearCell && yearCell.innerText.trim() !== yearFilterHome) {
          show = false;
        }
      }
    }

    row.style.display = show ? '' : 'none';
  });
}

// Debounced search
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('keyup', function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 500);
    });
  }

  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
    populateProgramDropdown();

    ['surname', 'firstName', 'middleName'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', function() {
          this.value = capitalizeNameWords(this.value);
        });
      }
    });
  }
});

function clearFilters() {
  // Clear global search
  document.getElementById('search').value = '';

  // Clear clearance logs filters
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

  // Clear home page filters
  const courseFilterHome = document.getElementById('courseFilter');
  if (courseFilterHome) courseFilterHome.value = '';
  const yearFilterHome = document.getElementById('yearFilter');
  if (yearFilterHome) yearFilterHome.value = '';

  applyFilters();
}

// ==================== REFRESH TABLE ====================
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

// ==================== CLEAR STATUS UPDATE (Point 13) ====================
function clearStatusUpdate() {
  document.getElementById('rfidSearch').value = '';
  document.getElementById('studentResult').style.display = 'none';
  currentStudentForUpdate = null;
}

// ==================== SELECT ALL (HOME) ====================
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

// ==================== CLEARANCE LOGS CHECKBOX HELPERS ====================
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

// ==================== EDIT / DELETE CLEARANCE LOGS ====================
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

// ==================== MODALS ====================
function showHelpModal() { document.getElementById('helpModal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('helpModal').style.display = 'none'; }
function showLogoutModal() { document.getElementById('logoutModal').style.display = 'flex'; }
function closeLogoutModal() { document.getElementById('logoutModal').style.display = 'none'; }
function showExportModal() { document.getElementById('exportModal').style.display = 'flex'; }
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }
function exportChosen(type) { closeExportModal(); exportData(type); }

// ==================== PRINT DIALOG ====================
function showPrintDialog(headers, rows, title) {
  const container = document.getElementById('printContainer');
  if (!container) {
    showMessageModal('Print container not found.');
    return;
  }

  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const html = `
    <h2 style="text-align: center; margin-bottom: 20px;">${title}</h2>
    <table>
      ${thead}
      ${tbody}
    </table>
  `;

  container.innerHTML = html;
  container.style.display = 'block';

  window.print();

  const hideContainer = () => {
    container.style.display = 'none';
    container.innerHTML = '';
  };

  if (window.matchMedia) {
    const mediaQueryList = window.matchMedia('print');
    const handleChange = (mql) => {
      if (!mql.matches) {
        hideContainer();
        mediaQueryList.removeListener(handleChange);
      }
    };
    mediaQueryList.addListener(handleChange);
  } else {
    setTimeout(hideContainer, 1000);
  }
}

// ==================== LOGIN ====================
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

    // 2FA: email must be verified
    if (!user.emailVerified) {
      showMessageModal('Please verify your email before logging in. Check your inbox.');
      await signOut(auth);
      return;
    }

    // Fetch user role and approval status from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      showMessageModal('User record not found. Please register again.');
      await signOut(auth);
      return;
    }

    const userData = userDoc.data();
    const role = userData.role || 'user';
    const approved = userData.approved;

    // For regular users, check approval
    if (role === 'user' && approved !== true) {
      showMessageModal('Your account is pending approval by superadmin. Please wait.');
      await signOut(auth);
      return;
    }

    // Redirect based on role
    if (role === 'user') {
      window.location.href = 'registrationPage.html';
    } else {
      // admin and superadmin both go to home.html
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

// ==================== LOGOUT ====================
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
function goRegistered() { window.location.href = 'clearanceTracking.html'; }
function goAdmin() { window.location.href = 'admin.html'; }

// ==================== USER REGISTRATION ====================
function showRegisterModal() {
  document.getElementById('regEmail').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('registerModal').style.display = 'flex';
}
function closeRegisterModal() {
  document.getElementById('registerModal').style.display = 'none';
}
async function register() {
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  if (!email || !password) {
    showMessageModal('Please enter email and password.');
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Send verification email
    await sendEmailVerification(userCredential.user);
    // Create a user document in Firestore with default role 'user'
    // Inside register() after creating user
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email: email,
      role: 'user',
      approved: false,          // <-- add this line
      createdAt: new Date()
    });
    showMessageModal('Registration successful! Please check your email to verify your account before logging in.');
    closeRegisterModal();
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
  } catch (err) {
    // Existing error handling (auth/email-already-in-use, etc.)
    if (err.code === 'auth/email-already-in-use') {
      showMessageModal('This email is already registered. Please use a different email or login.');
    } else if (err.code === 'auth/weak-password') {
      showMessageModal('Password is too weak. Please use a stronger password (at least 6 characters).');
    } else if (err.code === 'auth/invalid-email') {
      showMessageModal('The email address is not valid.');
    } else {
      showMessageModal('Registration failed: ' + err.message);
    }
  }
}

// ==================== PASSWORD RESET ====================
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
    showMessageModal('Password reset email sent. Check your inbox.');
    closeForgotPasswordModal();
    document.getElementById('resetEmail').value = '';
  } catch (err) {
    // Handle specific Firebase error codes
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

// ==================== ROLE-BASED ACCESS ====================
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

// ==================== DYNAMIC TOP BAR ====================
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
        helpText.innerText = 'SUPER ADMIN';
        helpIcon.innerHTML = 'A'; // capital 'A' for superadmin
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
  const text = document.getElementById('helpText').innerText;
  if (text === 'SUPER ADMIN') {
    window.location.href = 'superadmin.html';
  } else {
    showHelpModal();
  }
}

// ==================== EXPORT ====================
function exportData(type) {
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
      headerRow.deleteCell(0); // remove checkbox header
      if (headerRow.cells.length > 0) headerRow.deleteCell(0); // remove RFID header
    }
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0); // remove checkbox
        if (row.cells.length > 0) row.deleteCell(0); // remove RFID
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
        row.deleteCell(0); // checkbox
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
    XLSX.writeFile(wb, isLogTable ? 'clearance_logs.xlsx' : 'students.xlsx');
  } else if (type === 'pdf') {
    const headers = [];
    const thead = clone.querySelector('thead tr');
    if (thead) {
      thead.querySelectorAll('th').forEach(th => headers.push(th.innerText.trim()));
    }

    if (isLogTable && headers.length > 4) {
      headers[4] = "A.Y."; // After RFID removal, index 4 is ACADEMIC YEAR
    }

    const bodyRows = [];
    clone.querySelectorAll('tbody tr').forEach(tr => {
      const row = [];
      tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
      bodyRows.push(row);
    });

    const title = isLogTable ? 'Clearance Logs' : 'Student List';
    showPrintDialog(headers, bodyRows, title);
  } else if (type === 'csv') {
    // Build CSV rows from the same clone used for Excel
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

    // Convert to CSV string
    const csvContent = rows.map(row => 
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', isLogTable ? 'clearance_logs.csv' : 'students.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}