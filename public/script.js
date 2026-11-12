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

// ==================== SMALL HELPERS ====================
// Escape any value before putting it inside an innerHTML template.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// Date -> "YYYY-MM-DD" in Philippines time (UTC+8)
function toPhDateString(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
}

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
async function getUserProfile(user) {
  if (!user) return null;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  return userDoc.exists() ? userDoc.data() : null;
}

async function getUserRole(user) {
  try {
    const profile = await getUserProfile(user);
    return profile ? profile.role : null;
  } catch (err) {
    console.error('Error fetching user role:', err);
    return null;
  }
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
      let profile = null;
      try {
        profile = await getUserProfile(user);
      } catch (err) {
        console.error('Error fetching user profile:', err);
      }
      const role = profile ? profile.role : null;

      // Unverified emails and unapproved regular users never get into the app,
      // even if they still hold a signed-in session.
      if (!user.emailVerified || (role === 'user' && profile.approved !== true)) {
        await signOut(auth);
        window.location.href = 'index.html';
        return;
      }

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
      updateTopBarForRole(user);
      resolve(role);
    });
  });
}

/**
 * Show/hide sidebar navigation items according to the user's role.
 * @param {string} role - 'user', 'admin', or 'superadmin'
 */

// Returns current date and time in Philippines timezone (UTC+8) as "YYYY-MM-DD HH:MM:SS"
function getPhilippinesDateTimeString() {
  const now = new Date();
  // Philippines is UTC+8, so add 8 hours to UTC
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = phTime.getUTCFullYear();
  const month = String(phTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(phTime.getUTCDate()).padStart(2, '0');
  const hours = String(phTime.getUTCHours()).padStart(2, '0');
  const minutes = String(phTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(phTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ==================== SIDEBAR VISIBILITY / DISABLED STATE ====================
function updateSidebarForRole(role) {
  const navItems = document.querySelectorAll('.sidebar .nav');

  if (role === 'user') {
    // Users see only REGISTRATION – hide all other tabs
    navItems.forEach(item => {
      const onclick = item.getAttribute('onclick') || '';
      if (!onclick.includes('goRegister()')) {
        item.style.display = 'none';
      }
    });
  } else {
    // Admin and superadmin see all tabs – ensure all are visible
    navItems.forEach(item => item.style.display = 'flex');
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
// Data loading happens in each page's own script, after checkPageAccess() resolves.
document.addEventListener('DOMContentLoaded', function() {
  auth.onAuthStateChanged((user) => {
    updateTopBarForRole(user);
  });

  attachSortListeners();

  if (document.getElementById('date')) setDefaultDate();

  if (window.location.pathname.includes('registrationPage.html')) {
    enableHoverScroll();
  }

  if (window.location.pathname.includes('statusupdate.html')) {
    enableStatusUpdateHoverScroll();
    const rfidInput = document.getElementById('rfidSearch');
    if (rfidInput) {
      rfidInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); searchStudent(); }
      });
    }
  }

  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); login(); }
    });
  }

  loadDarkModePreference();

  const path = window.location.pathname.split('/').pop() || 'home.html';
  document.querySelectorAll('.sidebar .nav').forEach(link => {
    link.classList.remove('active');
    const onclick = link.getAttribute('onclick') || '';
    if (onclick.includes('goHome()') && path === 'home.html') link.classList.add('active');
    if (onclick.includes('goRegister()') && path === 'registrationPage.html') link.classList.add('active');
    if (onclick.includes('goStatusUpdate()') && path === 'statusupdate.html') link.classList.add('active');
    if (onclick.includes('goAdmin()') && path === 'admin.html') link.classList.add('active');
    if (onclick.includes('goRegistered()') && path === 'clearanceTracking.html') link.classList.add('active');
  });

  document.addEventListener('click', function(e) {
    const th = e.target.closest('th');
    if (!th) return;
    const table = th.closest('table');
    if (!table) return;
    const index = Array.from(th.parentNode.children).indexOf(th);
    if (table.id === 'adminStudentsTable' && index >= 0 && index <= 6) {
      handleAdminSort(index);
    } else if (table.id === 'programsTable' && (index === 0 || index === 1)) {
      handleProgramSort(index);
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
      <td>${escapeHtml(p.programCode)}</td>
      <td>${escapeHtml(p.programName)}</td>
      <td>
        <button onclick="editProgram('${escapeHtml(p.id)}')" class="export-btn" style="padding:2px 8px; margin-right:5px;">Edit</button>
        <button onclick="deleteProgram('${escapeHtml(p.id)}')" class="delete-btn" style="padding:2px 8px;">Delete</button>
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
    // Use setDoc with the code as document ID
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
  const id = document.getElementById('editProgramId').value; // this is the document ID
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

  // If the code changed, you need to decide whether to allow it.
  // For simplicity, we'll disallow changing the code.
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

function userFullName(user) {
  return [user.lastName, user.firstName].filter(Boolean).join(', ');
}

function renderUsersTable() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = filteredUsers.map(user => {
    const approved = user.approved ? 'Yes' : 'No';
    const createdAt = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString() : '';
    const uid = escapeHtml(user.uid);
    return `
      <tr>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(userFullName(user))}</td>
        <td>${escapeHtml(user.schoolId)}</td>
        <td>${escapeHtml(user.role || 'user')}</td>
        <td>${approved}</td>
        <td>${escapeHtml(createdAt)}</td>
        <td>
          ${!user.approved ? `<button onclick="showApproveConfirm('${uid}')" class="export-btn" style="margin-right:5px;">Approve</button>` : ''}
          <select id="role-${uid}" style="margin-right:5px; height:30px;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
          </select>
          <button onclick="showUpdateRoleConfirm('${uid}')" class="export-btn" style="margin-right:5px;">Update</button>
          <button onclick="showDeleteConfirm('${uid}')" class="delete-btn">Delete</button>
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
    if (search) {
      const haystack = `${user.email || ''} ${userFullName(user)} ${user.schoolId || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
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
    } else if (prop === 'name') {
      valA = userFullName(a).toLowerCase();
      valB = userFullName(b).toLowerCase();
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
    1: 'name',
    2: 'schoolId',
    3: 'role',
    4: 'approved',
    5: 'createdAt'
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
  pendingDeleteLogIds = [];
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
      <tr data-date="${escapeHtml(datePart)}">
        <td style="width: 30px; text-align: center;">
          <input type="checkbox" class="home-checkbox" data-doc-id="${escapeHtml(student.id)}" onchange="updateSelectAllHomeState()">
        </td>
        <td>${escapeHtml(student.rfidNumber)}</td>
        <td>${escapeHtml(student.studentNumber)}</td>
        <td>${escapeHtml(fullName)}</td>
        <td>${escapeHtml(student.program)}</td>
        <td>${escapeHtml(student.yearLevel)}</td>
        <td>${escapeHtml(student.academicYear)}</td>
        <td>${escapeHtml(student.gender)}</td>
        <td>${escapeHtml(datePart)}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

function fillFilterSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All</option>' +
    [...values].sort().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value = current;
}

function populateCourseFilter() {
  fillFilterSelect('courseFilter', new Set(allStudents.map(s => s.program).filter(Boolean)));
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
  fillFilterSelect('acadYearFilterHome', new Set(allStudents.map(s => s.academicYear).filter(Boolean)));
}

// ==================== RENDERING CLEARANCE LOGS TABLE ====================
function renderClearanceLogs(logs, keepSort = false) {
  const tbody = document.querySelector('#clearanceLogTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortLogs(logs, logSort.column, logSort.direction) : logs;
  tbody.innerHTML = data.map(log => {
    const releaseDate = log.claimedDate ? new Date(log.claimedDate.seconds * 1000).toLocaleString() : '';
    const receiveDate = log.returnedDate ? new Date(log.returnedDate.seconds * 1000).toLocaleString() : '';
    // Date range filter works on the release date, in Philippines time
    const filterDate = log.claimedDate ? toPhDateString(new Date(log.claimedDate.seconds * 1000)) : '';
    return `
      <tr data-date="${escapeHtml(filterDate)}">
        <td style="text-align: center;">
          <input type="checkbox" class="log-checkbox" data-log-id="${escapeHtml(log.id)}" onchange="updateSelectAllLogsState()">
        </td>
        <td>${escapeHtml(log.rfid)}</td>
        <td>${escapeHtml(log.studentNumber)}</td>
        <td>${escapeHtml(log.name)}</td>
        <td>${escapeHtml(releaseDate)}</td>
        <td>${escapeHtml(receiveDate)}</td>
        <td>${escapeHtml(log.academicYear)}</td>
        <td>${escapeHtml(log.semester)}</td>
        <td>${escapeHtml(log.yearLevel)}</td>
        <td>${escapeHtml(log.program)}</td>
        <td>${escapeHtml(log.remarks)}</td>
        <td>${escapeHtml(log.status)}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

// ==================== SORTING ====================
function getSortProperty(columnIndex, isLogTable) {
  if (isLogTable) {
    // Clearance logs table column indices:
    // 0=checkbox, 1=RFID, 2=ID, 3=NAME, 4=RELEASE, 5=RECEIVE, 6=A.Y., 7=SEMESTER,
    // 8=YEAR LEVEL, 9=COURSE, 10=REMARKS, 11=STATUS
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
    // Home table (student list) column indices:
    // 0=checkbox, 1=RFID, 2=STUDENT NO, 3=NAME, 4=COURSE, 5=YEAR LEVEL, 6=GENDER, 7=DATE
    const map = {
      1: 'rfidNumber',
      2: 'studentNumber',
      3: 'name',
      4: 'program',
      5: 'yearLevel',
      6: 'academicYear',   // new
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
      if (index === 0) return; // Skip checkbox column
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
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
  const docId = selected[0].getAttribute('data-doc-id');
  window.location.href = `registrationPage.html?docId=${encodeURIComponent(docId)}`;
}

// ==================== DELETE SELECTED (HOME) ====================
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

// Note: `confirmDelete` already works with document IDs, so no change needed there.

// ==================== RFID AUTO‑FILL ====================
async function checkRFID() {
  const rfid = document.getElementById('rfidNumber').value.trim();
  if (!rfid) return;
  try {
    const docRef = doc(db, 'students', rfid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // If exists, treat as edit mode
      setupEditMode(rfid); // rfid is the document ID
    } else {
      // New student mode
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

// ==================== REGISTRATION PAGE EDIT MODE ====================
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
    const studentId = docSnap.id; // document ID

    // Determine student type
    const hasRfid = !!student.rfidNumber;
    const studentType = hasRfid ? 'new' : 'old';

    // Set the hidden field and switch tab
    document.getElementById('studentType').value = studentType;
    if (studentType === 'new') {
      switchRegistrationTab('new');
      document.getElementById('rfidNumber').value = student.rfidNumber || '';
      document.getElementById('studentNumber').value = student.studentNumber || '';
      document.getElementById('rfidNumber').disabled = true;
      document.getElementById('studentNumber').disabled = true;
    } else {
      switchRegistrationTab('old');
      // No RFID or student number fields to fill
    }

    // Fill common fields
    document.querySelector('[data-field="surname"]').value = student.surname || '';
    document.querySelector('[data-field="firstName"]').value = student.firstName || '';
    document.querySelector('[data-field="middleName"]').value = student.middleName || '';
    document.querySelector('[data-field="program"]').value = student.program || '';
    document.querySelector('[data-field="yearLevel"]').value = student.yearLevel || '';
    document.querySelector('[data-field="gender"]').value = student.gender || '';

    // after setting common fields
    const academicYearSelect = document.getElementById('academicYear');
    if (student.academicYear) {
      academicYearSelect.value = student.academicYear;
    } else {
      academicYearSelect.selectedIndex = 0; // default to "Select A.Y."
    }

    // Set the date display to the original registration date (if exists)
    if (student.dateTime) {
      const originalDate = student.dateTime.split(' ')[0]; // YYYY-MM-DD part
      document.getElementById('date').value = originalDate;
      document.getElementById('displayDate').textContent = originalDate;
    } else {
      // Fallback to today's Philippines date (should never happen)
      const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
      const phDate = phNow.toISOString().split('T')[0];
      document.getElementById('date').value = phDate;
      document.getElementById('displayDate').textContent = phDate;
    }

    // Disable date and make fields editable
    document.querySelector('[data-field="surname"]').disabled = false;
    document.querySelector('[data-field="firstName"]').disabled = false;
    document.querySelector('[data-field="middleName"]').disabled = false;
    document.querySelector('[data-field="program"]').disabled = false;
    document.querySelector('[data-field="yearLevel"]').disabled = false;
    document.querySelector('[data-field="gender"]').disabled = false;

    const btn = document.getElementById('registerButton');
    btn.textContent = 'UPDATE';
    btn.onclick = () => validateAndUpdate(studentId); // pass docId
    isEditMode = true;
  } catch (err) {
    console.error('Edit setup error:', err);
    showMessageModal('Error loading student data.');
  }
}

// ==================== REGISTRATION (OLD STUDENT) ====================
async function registerOldStudent() {
  clearAllFieldErrors();
  formatAllNameFields();

  // Validate that the displayed date is today's Philippines date
  if (!validateDateIsToday()) return;

  const surname = document.getElementById('surname').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const middleName = document.getElementById('middleName').value.trim();
  const program = document.getElementById('program').value;
  const yearLevel = document.getElementById('yearLevel').value;
  const academicYear = document.getElementById('academicYear').value;
  const gender = document.getElementById('gender').value;

  // Client-side validation
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

  // Get current Philippines date and time (UTC+8)
  const dateTime = getPhilippinesDateTimeString();

  // Student object (no rfidNumber, no studentNumber)
  const student = {
    surname,
    firstName,
    middleName,
    program,
    yearLevel,
    academicYear,  // <-- new field
    gender,
    dateTime,
  };

  try {
    // Add a new document with auto-generated ID
    await addDoc(collection(db, 'students'), student);

    // Clear form fields
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('yearLevel').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;

    // Reset the date display to today's Philippines date
    const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
    const phDate = phNow.toISOString().split('T')[0];
    document.getElementById('date').value = phDate;
    document.getElementById('displayDate').textContent = phDate;

    // Show success modal
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
    newFields.style.display = 'block'; // or 'flex' depending on layout
    rfidInput.disabled = false;
    studentNumberInput.disabled = false;
    registerBtn.onclick = validateAndRegister;
    registerBtn.textContent = 'REGISTER';
    // Reset form for new student (optional)
    resetRegistrationForm();
  } else {
    newFields.style.display = 'none';
    rfidInput.disabled = true;
    studentNumberInput.disabled = true;
    registerBtn.onclick = registerOldStudent;
    registerBtn.textContent = 'REGISTER OLD STUDENT';
    // Clear old student fields (keep common fields)
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('yearLevel').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;
    setDefaultDate(); // reset date
  }
}

// ==================== HELPER: VALIDATE DATE IS TODAY ====================
function validateDateIsToday() {
  const dateInput = document.getElementById('date');
  const selectedDate = dateInput.value;
  // Get current Philippines date (UTC+8)
  const phNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
  const phDate = phNow.toISOString().split('T')[0];
  if (selectedDate !== phDate) {
    showFieldError('date');
    showMessageModal('Date must be today\'s date.');
    return false;
  }
  return true;
}

// ==================== UPDATE STUDENT (with confirmation) ====================
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
    academicYear: document.getElementById('academicYear').value,   // new
    date: document.getElementById('date').value.trim()
  };

  // For new students, also include RFID and student number
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

  // For new students, check duplicate student number (excluding current)
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
      academicYear: formData.academicYear,   // new
    };

    // For new students, also update studentNumber (rfidNumber is immutable)
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

// ==================== REGISTRATION (NEW STUDENT) ====================
async function validateAndRegister() {
  clearAllFieldErrors();
  formatAllNameFields();

  // Validate date is today (only for new registrations)
  if (!validateDateIsToday()) return;

  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    surname: document.querySelector('[data-field="surname"]').value.trim(),
    firstName: document.querySelector('[data-field="firstName"]').value.trim(),
    middleName: document.querySelector('[data-field="middleName"]').value.trim(),
    program: document.querySelector('[data-field="program"]').value,
    yearLevel: document.querySelector('[data-field="yearLevel"]').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
    academicYear: document.getElementById('academicYear').value,   // new
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
  const dateTime = getPhilippinesDateTimeString();  // <-- changed

  const student = {
    rfidNumber: formData.rfidNumber,
    surname: formData.surname,
    firstName: formData.firstName,
    middleName: formData.middleName,
    program: formData.program,
    yearLevel: formData.yearLevel,
    studentNumber: formData.studentNumber,
    academicYear: formData.academicYear,   // new
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
  // Do NOT reset or enable the date field
  // document.getElementById('date').value = ''; // remove this line
  // document.getElementById('date').disabled = false; // remove this line
  
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
  // date remains disabled (already set)
  
  const btn = document.getElementById('registerButton');
  btn.textContent = 'REGISTER';
  btn.onclick = validateAndRegister;
  isEditMode = false;
  clearAllFieldErrors();
  // setDefaultDate() is not needed because date is already today and disabled
}

function clearRegistrationForm() {
  if (isEditMode) {
    // Clear only editable fields (surname, firstName, middleName, program, gender)
    document.querySelector('[data-field="surname"]').value = '';
    document.querySelector('[data-field="firstName"]').value = '';
    document.querySelector('[data-field="middleName"]').value = '';
    
    const program = document.querySelector('[data-field="program"]');
    if (program) program.selectedIndex = 0;
    
    const gender = document.querySelector('[data-field="gender"]');
    if (gender) gender.selectedIndex = 0;
    
    clearAllFieldErrors();
  } else {
    // For new registration, clear all visible fields based on tab
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
    // Date remains today and disabled – do not change
    clearAllFieldErrors();
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

  // Default values for dropdowns
  const defaultRemarks = 'None';
  const defaultSemester = '1st';

  // Build semester options (no academic year dropdown)
  const semesterOptions = `
    <option value="" disabled>Select Semester</option>
    <option value="1st" ${defaultSemester === '1st' ? 'selected' : ''}>1st Semester</option>
    <option value="2nd" ${defaultSemester === '2nd' ? 'selected' : ''}>2nd Semester</option>
  `;

  container.innerHTML = `
    <div class="student-details">
      <table class="student-info-table">
        <tr><th>Name</th><td>${escapeHtml(fullName)}</td></tr>
        <tr><th>Program</th><td>${escapeHtml(student.program)}</td></tr>
        <tr><th>Year Level</th><td>${escapeHtml(student.yearLevel)}</td></tr>
        <tr><th>Student Number</th><td>${escapeHtml(student.studentNumber)}</td></tr>
        <tr><th>Academic Year</th><td>${escapeHtml(student.academicYear)}</td></tr>
        <tr><th>Gender</th><td>${escapeHtml(student.gender)}</td></tr>
      </table>

      <div class="button-group">
        <button class="btn-release" onclick="releaseStudent('${escapeHtml(student.rfidNumber)}')">RELEASE</button>
        <button class="btn-receive" onclick="receiveStudent('${escapeHtml(student.rfidNumber)}')">RECEIVE</button>
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

    // Validate that student has an academic year
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
      student.academicYear,   // <-- use student's stored academic year
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
      student.academicYear,   // <-- use student's stored academic year
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
  const today = toPhDateString(new Date());
  dateInput.value = today;
  const display = document.getElementById('displayDate');
  if (display) display.textContent = today;
}

// ==================== POPULATE FILTERS ====================
function populateLogFilters() {
  const values = key => new Set(clearanceLogs.map(log => log[key]).filter(Boolean));
  fillFilterSelect('semesterFilter', values('semester'));
  fillFilterSelect('remarksFilter', values('remarks'));
  fillFilterSelect('courseFilterLogs', values('program'));
  fillFilterSelect('yearFilterLogs', values('yearLevel'));
  fillFilterSelect('acadYearFilter', values('academicYear'));
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
  const acadYearFilter = document.getElementById('acadYearFilter')?.value || ''; // logs

  // Home page filters
  const courseFilterHome = document.getElementById('courseFilter')?.value || '';
  const yearFilterHome = document.getElementById('yearFilter')?.value || '';
  const acadYearFilterHome = document.getElementById('acadYearFilterHome')?.value || '';
  const genderFilterHome = document.getElementById('genderFilterHome')?.value || '';

  // Date range (YYYY-MM-DD strings compare correctly as text)
  const dateFrom = document.getElementById('dateFrom')?.value || '';
  const dateTo = document.getElementById('dateTo')?.value || '';

  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;

    // Global search: check all text in the row
    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }

    if (show) {
      if (isLogTable) {
        // Clearance logs table column indices:
        // 0:checkbox, 1:RFID, 2:ID, 3:NAME, 4:RELEASE, 5:RECEIVE, 6:A.Y., 7:SEMESTER, 8:YEAR LEVEL, 9:COURSE, 10:REMARKS, 11:STATUS
        const statusCell = row.cells[11];
        const semesterCell = row.cells[7];
        const remarksCell = row.cells[10];
        const courseCell = row.cells[9];
        const yearCell = row.cells[8];
        const acadYearCell = row.cells[6];

        if (statusFilter && statusCell && statusCell.innerText.trim() !== statusFilter) show = false;
        if (show && semesterFilter && semesterCell && semesterCell.innerText.trim() !== semesterFilter) show = false;
        if (show && remarksFilter && remarksCell && remarksCell.innerText.trim() !== remarksFilter) show = false;
        if (show && courseFilterLogs && courseCell && courseCell.innerText.trim() !== courseFilterLogs) show = false;
        if (show && yearFilterLogs && yearCell && yearCell.innerText.trim() !== yearFilterLogs) show = false;
        if (show && acadYearFilter && acadYearCell && acadYearCell.innerText.trim() !== acadYearFilter) show = false;
      } else {
        // Home table – column indices: 0:checkbox, 1:RFID, 2:STUDENT NO, 3:NAME, 4:COURSE, 5:YEAR LEVEL, 6:A.Y., 7:GENDER, 8:DATE
        const courseCell = row.cells[4];
        const yearCell = row.cells[5];
        const acadYearCell = row.cells[6];
        const genderCell = row.cells[7];

        if (courseFilterHome && courseCell && courseCell.innerText.trim() !== courseFilterHome) show = false;
        if (show && yearFilterHome && yearCell && yearCell.innerText.trim() !== yearFilterHome) show = false;
        if (show && acadYearFilterHome && acadYearCell && acadYearCell.innerText.trim() !== acadYearFilterHome) show = false;
        if (show && genderFilterHome && genderCell && genderCell.innerText.trim() !== genderFilterHome) show = false;
      }
    }

    if (show && (dateFrom || dateTo)) {
      const rowDate = row.dataset.date || '';
      if (!rowDate || (dateFrom && rowDate < dateFrom) || (dateTo && rowDate > dateTo)) show = false;
    }

    row.style.display = show ? '' : 'none';
  });
}

// Keep the From/To pickers from allowing an impossible range
function syncDateRange() {
  const from = document.getElementById('dateFrom');
  const to = document.getElementById('dateTo');
  if (!from || !to) return;
  to.min = from.value || '';
  from.max = to.value || '';
}

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
  const acadYearFilter = document.getElementById('acadYearFilter');
  if (acadYearFilter) acadYearFilter.value = '';

  // Clear home page filters
  const courseFilterHome = document.getElementById('courseFilter');
  if (courseFilterHome) courseFilterHome.value = '';
  const yearFilterHome = document.getElementById('yearFilter');
  if (yearFilterHome) yearFilterHome.value = '';
  const acadYearFilterHome = document.getElementById('acadYearFilterHome');
  if (acadYearFilterHome) acadYearFilterHome.value = '';
  const genderFilterHome = document.getElementById('genderFilterHome');
  if (genderFilterHome) genderFilterHome.value = '';

  const dateFrom = document.getElementById('dateFrom');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('dateTo');
  if (dateTo) dateTo.value = '';
  syncDateRange();

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

function getProgramFullName(code) {
  if (!code) return '';
  if (!programs || programs.length === 0) {
    console.warn('Programs not loaded yet');
    return code; // fallback to code
  }
  const program = programs.find(p => p.programCode === code);
  return program ? program.programName : code;
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
function showPrintDialog(headers, rows, title, filterInfo = {}) {
  // Remove a frame left over from a previous export
  const old = document.getElementById('printFrame');
  if (old) old.remove();

  const filterParts = [];
  if (filterInfo.acadYear) filterParts.push('S.Y. ' + filterInfo.acadYear);
  if (filterInfo.semester) filterParts.push(filterInfo.semester + ' Sem');
  if (filterInfo.year) filterParts.push(filterInfo.year + ' Year');
  if (filterInfo.gender) filterParts.push(filterInfo.gender);
  if (filterInfo.remarks) filterParts.push(filterInfo.remarks);
  if (filterInfo.status) filterParts.push(filterInfo.status);
  if (filterInfo.dateFrom && filterInfo.dateTo) filterParts.push(`${filterInfo.dateFrom} to ${filterInfo.dateTo}`);
  else if (filterInfo.dateFrom) filterParts.push(`From ${filterInfo.dateFrom}`);
  else if (filterInfo.dateTo) filterParts.push(`Until ${filterInfo.dateTo}`);

  const courseText = filterInfo.courseFull || filterInfo.course || '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0.2in; size: auto; }
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .header { text-align: center; margin-bottom: 20px; }
    h1 { font-size: 16pt; margin: 0.15in 0 0 0; font-weight: bold; }
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
    <h2>${escapeHtml(title)}</h2>
    ${filterParts.length ? `<div class="filter-info">${escapeHtml(filterParts.join(' | '))}</div>` : ''}
    ${courseText ? `<div class="course-info">${escapeHtml(courseText)}</div>` : ''}
  </div>
  <table>
    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.id = 'printFrame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';

  // The load handler must be attached BEFORE the content is set. The old code attached it
  // after document.write()/close(), so on Safari (Mac) the load event had already fired and
  // print() was never called. The frame is also no longer removed on a timer: Safari's print
  // preview stays open after print() returns, so the frame is removed after printing instead.
  iframe.onload = function() {
    const win = iframe.contentWindow;
    win.onafterprint = () => iframe.remove();
    win.focus();
    win.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
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
      showMessageModal('Please verify your email before logging in.\nCheck your inbox, and if you cannot find the email, check your spam or junk folder.');
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
const REGISTER_FIELD_ORDER = ['regSchoolId', 'regFirstName', 'regLastName', 'regEmail', 'regPassword', 'regConfirmPassword'];
let isRegistering = false;

function showRegisterModal() {
  REGISTER_FIELD_ORDER.forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('error-field', 'match-ok', 'match-bad');
  });
  const showPw = document.getElementById('showRegPassword');
  showPw.checked = false;
  toggleRegPassword();
  updatePasswordMatch();
  document.getElementById('registerModal').style.display = 'flex';
  const first = document.getElementById(REGISTER_FIELD_ORDER[0]);
  first.removeAttribute('readonly');
  first.focus();
}
function closeRegisterModal() {
  document.getElementById('registerModal').style.display = 'none';
}
// Enter moves to the next field; Enter on the last field submits.
function registerKeyNav(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const i = REGISTER_FIELD_ORDER.indexOf(e.target.id);
  if (i < REGISTER_FIELD_ORDER.length - 1) {
    const next = document.getElementById(REGISTER_FIELD_ORDER[i + 1]);
    next.removeAttribute('readonly');
    next.focus();
  } else {
    register();
  }
}

// Live "passwords match" indicator under the confirm field
function updatePasswordMatch() {
  const password = document.getElementById('regPassword').value;
  const confirmEl = document.getElementById('regConfirmPassword');
  const indicator = document.getElementById('passwordMatchIndicator');
  confirmEl.classList.remove('match-ok', 'match-bad');
  if (!confirmEl.value) {
    indicator.textContent = '';
    indicator.className = 'pw-match';
    return;
  }
  const matches = password === confirmEl.value;
  indicator.textContent = matches ? '\u2713 Passwords match' : '\u2717 Passwords do not match';
  indicator.className = 'pw-match ' + (matches ? 'ok' : 'bad');
  confirmEl.classList.add(matches ? 'match-ok' : 'match-bad');
}

async function register() {
  if (isRegistering) return;

  REGISTER_FIELD_ORDER.forEach(id => document.getElementById(id).classList.remove('error-field'));

  const value = id => document.getElementById(id).value;
  const schoolId = value('regSchoolId').trim().toUpperCase();
  const firstName = capitalizeNameWords(value('regFirstName'));
  const lastName = capitalizeNameWords(value('regLastName'));
  const email = value('regEmail').trim().toLowerCase();
  const password = value('regPassword');
  const confirm = value('regConfirmPassword');

  // Every field is required
  const required = {
    regSchoolId: schoolId, regFirstName: firstName, regLastName: lastName,
    regEmail: email, regPassword: password, regConfirmPassword: confirm
  };
  let missing = false;
  Object.entries(required).forEach(([id, v]) => {
    if (!v) { document.getElementById(id).classList.add('error-field'); missing = true; }
  });
  if (missing) {
    showMessageModal('Please fill in all required fields.');
    return;
  }

  if (!/^[A-Z0-9-]{4,20}$/.test(schoolId)) {
    document.getElementById('regSchoolId').classList.add('error-field');
    showMessageModal('School ID must be 4 to 20 characters: letters, numbers, or dashes only.');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('regEmail').classList.add('error-field');
    showMessageModal('The email address is not valid.');
    return;
  }

  if (password.length < 8) {
    document.getElementById('regPassword').classList.add('error-field');
    showMessageModal('Password must be at least 8 characters long.');
    return;
  }

  if (password !== confirm) {
    document.getElementById('regConfirmPassword').classList.add('error-field');
    showMessageModal('Passwords do not match.');
    return;
  }

  isRegistering = true;
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email,
      schoolId,
      firstName,
      lastName,
      role: 'user',
      approved: false,
      createdAt: new Date()
    });
    await sendEmailVerification(userCredential.user);
    // Registering signs the new user in automatically; they must verify and be approved first.
    await signOut(auth);

    closeRegisterModal();
    showMessageModal(
      'Registration successful!\n\n' +
      `A verification email was sent to ${email}. Please check your inbox and also your spam or junk folder.\n\n` +
      'After verifying your email, your account must be approved by an administrator before you can log in.'
    );
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showMessageModal('This email is already registered. Please use a different email or login.');
    } else if (err.code === 'auth/weak-password') {
      showMessageModal('Password is too weak. Please use at least 8 characters.');
    } else if (err.code === 'auth/invalid-email') {
      showMessageModal('The email address is not valid.');
    } else {
      showMessageModal('Registration failed: ' + err.message);
    }
  } finally {
    isRegistering = false;
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
    showMessageModal('Password reset email sent.\nPlease check your inbox, and also your spam or junk folder.');
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

// ==================== IMPORT STUDENTS (admin / superadmin only) ====================
const IMPORT_MAX_ROWS = 2000;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
// Security rules may only do 20 document lookups per batched write, and each student write
// looks up the user's role, so keep batches small.
const IMPORT_BATCH_SIZE = 10;

const IMPORT_COLUMNS = [
  { key: 'rfidNumber',    label: 'RFID No.',      required: true,  aliases: ['rfid', 'rfidno', 'rfidnumber'] },
  { key: 'studentNumber', label: 'Student No.',   required: true,  aliases: ['studentno', 'studentnumber', 'idnumber', 'idno', 'studentid'] },
  { key: 'surname',       label: 'Surname',       required: true,  aliases: ['surname', 'lastname', 'familyname'] },
  { key: 'firstName',     label: 'First Name',    required: true,  aliases: ['firstname', 'givenname'] },
  { key: 'middleName',    label: 'Middle Name',   required: false, aliases: ['middlename'] },
  { key: 'program',       label: 'Program',       required: true,  aliases: ['program', 'course', 'programcourse', 'programcode'] },
  { key: 'yearLevel',     label: 'Year Level',    required: true,  aliases: ['yearlevel', 'year'] },
  { key: 'academicYear',  label: 'Academic Year', required: true,  aliases: ['academicyear', 'ay', 'schoolyear', 'sy'] },
  { key: 'gender',        label: 'Gender',        required: true,  aliases: ['gender', 'sex'] }
];

const IMPORT_YEAR_LEVELS = {
  '1': '1st', '1st': '1st', 'first': '1st',
  '2': '2nd', '2nd': '2nd', 'second': '2nd',
  '3': '3rd', '3rd': '3rd', 'third': '3rd',
  '4': '4th', '4th': '4th', 'fourth': '4th',
  'irregular': 'Irregular', 'irreg': 'Irregular'
};

const IMPORT_GENDERS = {
  'male': 'Male', 'm': 'Male',
  'female': 'Female', 'f': 'Female',
  'other': 'Other', 'o': 'Other'
};

let pendingImportRecords = [];

async function assertImportAllowed() {
  const role = await getUserRole(auth.currentUser);
  if (role !== 'admin' && role !== 'superadmin') {
    throw new Error('Only admins and superadmins can import students.');
  }
}

async function showImportModal() {
  try {
    await assertImportAllowed();
  } catch (err) {
    showMessageModal(err.message);
    return;
  }
  resetImportModal();
  document.getElementById('importModal').style.display = 'flex';
}

function closeImportModal() {
  document.getElementById('importModal').style.display = 'none';
  resetImportModal();
}

function resetImportModal() {
  pendingImportRecords = [];
  document.getElementById('importFile').value = '';
  const summary = document.getElementById('importSummary');
  summary.style.display = 'none';
  summary.innerHTML = '';
  const btn = document.getElementById('importConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Import';
}

function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();

  const students = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(c => c.label)]);
  students['!cols'] = IMPORT_COLUMNS.map(c => ({ wch: Math.max(c.label.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, students, 'Students');

  const year = Number(toPhDateString(new Date()).slice(0, 4));
  const help = XLSX.utils.aoa_to_sheet([
    ['Column', 'What to enter'],
    ['RFID No.', 'Digits only. Format this column as Text in Excel so leading zeros are kept.'],
    ['Student No.', 'One letter followed by 6 digits, e.g. C123456'],
    ['Surname / First Name', 'Letters, spaces, apostrophes and hyphens. Capitalization is fixed automatically.'],
    ['Middle Name', 'Optional. Every other column is required.'],
    ['Program', 'One of: ' + (programs.map(p => p.programCode).concat('Others').join(', '))],
    ['Year Level', '1st, 2nd, 3rd, 4th or Irregular (1, 2, 3, 4 also work)'],
    ['Academic Year', `e.g. ${year}-${year + 1} (second year must be the first year + 1)`],
    ['Gender', 'Male, Female or Other']
  ]);
  help['!cols'] = [{ wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, help, 'Instructions');

  XLSX.writeFile(wb, 'student_import_template.xlsx');
}

// RFID numbers and student numbers already in Firestore (fresh read, not the cached table)
async function fetchExistingStudentKeys() {
  const snapshot = await getDocs(collection(db, 'students'));
  const rfids = new Set();
  const numbers = new Set();
  snapshot.docs.forEach(d => {
    rfids.add(d.id);
    const n = d.data().studentNumber;
    if (n) numbers.add(n);
  });
  return { rfids, numbers };
}

function normalizeImportHeader(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanImportName(value, maxLength) {
  const cleaned = String(value ?? '')
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return capitalizeNameWords(cleaned).slice(0, maxLength);
}

// Returns { record, errors } for one spreadsheet row, with proper formatting applied.
function validateImportRow(raw, resolveProgram) {
  const errors = [];
  const text = key => String(raw[key] ?? '').trim();

  const rfidNumber = text('rfidNumber').replace(/\s/g, '');
  if (!rfidNumber) {
    errors.push('RFID No. is required');
  } else if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(rfidNumber)) {
    errors.push('RFID No. is in scientific notation (format the column as Text in Excel)');
  } else if (!/^\d{1,32}$/.test(rfidNumber)) {
    errors.push('RFID No. must be digits only');
  }

  const studentNumber = text('studentNumber').replace(/\s/g, '').toUpperCase();
  if (!isValidStudentNumber(studentNumber)) {
    errors.push('Student No. must be one letter followed by 6 digits (e.g. C123456)');
  }

  const surname = cleanImportName(raw.surname, 64);
  if (!surname) errors.push('Surname is required');
  const firstName = cleanImportName(raw.firstName, 64);
  if (!firstName) errors.push('First Name is required');
  const middleName = cleanImportName(raw.middleName, 30);

  const program = resolveProgram(text('program'));
  if (!text('program')) errors.push('Program is required');
  else if (!program) errors.push(`Unknown program "${text('program')}"`);

  const yearKey = text('yearLevel').toLowerCase().replace(/\b(year|yr)\b/g, '').replace(/[\s.]/g, '');
  const yearLevel = IMPORT_YEAR_LEVELS[yearKey];
  if (!yearLevel) errors.push(`Invalid Year Level "${text('yearLevel')}"`);

  const ay = text('academicYear').match(/^(\d{4})\s*[-\u2013/]\s*(\d{4})$/);
  const academicYear = ay && Number(ay[2]) === Number(ay[1]) + 1 ? `${ay[1]}-${ay[2]}` : '';
  if (!academicYear) errors.push(`Academic Year "${text('academicYear')}" must look like 2025-2026`);

  const gender = IMPORT_GENDERS[text('gender').toLowerCase()];
  if (!gender) errors.push(`Invalid Gender "${text('gender')}"`);

  return {
    errors,
    record: { rfidNumber, studentNumber, surname, firstName, middleName, program, yearLevel, academicYear, gender }
  };
}

async function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;

  const summary = document.getElementById('importSummary');
  const confirmBtn = document.getElementById('importConfirmBtn');
  pendingImportRecords = [];
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Import';
  summary.style.display = 'block';
  summary.textContent = 'Reading file...';

  try {
    await assertImportAllowed();
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Please choose an .xlsx, .xls or .csv file.');
    if (file.size > IMPORT_MAX_BYTES) throw new Error('The file is too large (5 MB maximum).');
    if (!programs.length) await loadPrograms();

    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    if (matrix.length < 2) throw new Error('The file has no student rows.');
    if (matrix.length - 1 > IMPORT_MAX_ROWS) throw new Error(`Too many rows (${IMPORT_MAX_ROWS} maximum per import).`);

    // Map columns by header name
    const columnIndex = {};
    matrix[0].forEach((header, i) => {
      const norm = normalizeImportHeader(header);
      const col = IMPORT_COLUMNS.find(c => c.aliases.includes(norm));
      if (col && !(col.key in columnIndex)) columnIndex[col.key] = i;
    });
    const missingCols = IMPORT_COLUMNS.filter(c => c.required && !(c.key in columnIndex)).map(c => c.label);
    if (missingCols.length) throw new Error('Missing column(s): ' + missingCols.join(', ') + '. Download the template to see the expected headers.');

    const programLookup = new Map();
    programs.forEach(p => {
      programLookup.set(p.programCode.toLowerCase(), p.programCode);
      programLookup.set(String(p.programName).toLowerCase(), p.programCode);
    });
    programLookup.set('others', 'Others');
    const resolveProgram = v => programLookup.get(v.toLowerCase());

    const existing = await fetchExistingStudentKeys();
    const seenRfid = new Map();
    const seenNumber = new Map();
    const records = [];
    const issues = [];

    for (let r = 1; r < matrix.length; r++) {
      const cells = matrix[r];
      if (cells.every(c => String(c).trim() === '')) continue;   // skip blank rows

      const raw = {};
      Object.entries(columnIndex).forEach(([key, i]) => { raw[key] = cells[i]; });
      const sheetRow = r + 1;
      const { record, errors } = validateImportRow(raw, resolveProgram);

      if (!errors.length) {
        if (existing.rfids.has(record.rfidNumber)) errors.push('RFID No. is already registered');
        else if (seenRfid.has(record.rfidNumber)) errors.push(`RFID No. is repeated in this file (row ${seenRfid.get(record.rfidNumber)})`);
        if (existing.numbers.has(record.studentNumber)) errors.push('Student No. is already registered');
        else if (seenNumber.has(record.studentNumber)) errors.push(`Student No. is repeated in this file (row ${seenNumber.get(record.studentNumber)})`);
      }

      if (errors.length) {
        issues.push({ row: sheetRow, messages: errors });
      } else {
        records.push(record);
        seenRfid.set(record.rfidNumber, sheetRow);
        seenNumber.set(record.studentNumber, sheetRow);
      }
    }

    pendingImportRecords = records;
    renderImportSummary(records.length, issues);
    confirmBtn.disabled = records.length === 0;
    confirmBtn.textContent = records.length ? `Import ${records.length} student${records.length === 1 ? '' : 's'}` : 'Import';
  } catch (err) {
    console.error('Import read error:', err);
    summary.textContent = err.message;
    summary.classList.add('import-error');
  }
}

function renderImportSummary(validCount, issues) {
  const summary = document.getElementById('importSummary');
  summary.classList.remove('import-error');
  summary.innerHTML = '';

  const line = document.createElement('p');
  line.textContent = `${validCount} row(s) ready to import. ${issues.length} row(s) will be skipped.`;
  summary.appendChild(line);

  if (issues.length) {
    const list = document.createElement('ul');
    list.className = 'import-issues';
    issues.slice(0, 50).forEach(issue => {
      const li = document.createElement('li');
      li.textContent = `Row ${issue.row}: ${issue.messages.join('; ')}`;
      list.appendChild(li);
    });
    if (issues.length > 50) {
      const more = document.createElement('li');
      more.textContent = `...and ${issues.length - 50} more`;
      list.appendChild(more);
    }
    summary.appendChild(list);
  }
}

async function confirmImport() {
  if (isProcessing || pendingImportRecords.length === 0) return;
  isProcessing = true;
  const confirmBtn = document.getElementById('importConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Importing...';

  let written = 0;
  let total = 0;
  try {
    await assertImportAllowed();

    // Re-check against Firestore right before writing; someone may have registered a student meanwhile
    const existing = await fetchExistingStudentKeys();
    const toWrite = pendingImportRecords.filter(r => !existing.rfids.has(r.rfidNumber) && !existing.numbers.has(r.studentNumber));
    const skipped = pendingImportRecords.length - toWrite.length;
    total = toWrite.length;
    const dateTime = getPhilippinesDateTimeString();

    for (let i = 0; i < toWrite.length; i += IMPORT_BATCH_SIZE) {
      const batch = writeBatch(db);
      toWrite.slice(i, i + IMPORT_BATCH_SIZE).forEach(rec => {
        batch.set(doc(db, 'students', rec.rfidNumber), { ...rec, dateTime });
      });
      await batch.commit();
      written += Math.min(IMPORT_BATCH_SIZE, toWrite.length - i);
      confirmBtn.textContent = `Importing ${written}/${total}...`;
    }

    closeImportModal();
    await loadStudents();
    showMessageModal(`Imported ${written} student(s).` + (skipped ? `\n${skipped} skipped because they were registered in the meantime.` : ''));
  } catch (err) {
    console.error('Import error:', err);
    showMessageModal(`Import stopped after ${written} of ${total} student(s): ${err.message}`);
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Retry import';
  } finally {
    isProcessing = false;
  }
}

// ==================== EXPORT HELPERS ====================
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
      return true; // success, file saved via picker
    } catch (err) {
      // If user cancelled, return true to indicate no further action needed
      if (err.name === 'AbortError') {
        return true; // user canceled, do not fallback
      }
      // For other errors, log and fallback
      console.log('Save picker failed, falling back', err);
      return false;
    }
  }
  return false; // API not supported, fallback to old method
}

// ==================== EXPORT ====================
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
    const wbdata = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbdata], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = isLogTable ? 'clearance_logs.xlsx' : 'students.xlsx';
    const usedPicker = await saveFileWithPicker(blob, filename);
    if (!usedPicker) {
      // Fallback: create download link
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
    // Prepare headers (replace SEMESTER -> SEM, YEAR LEVEL -> YEAR)
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

    // Adjust headers for logs if needed (already done in clone)
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

    // Collect filter info
    const filterInfo = {};
    if (isLogTable) {
      filterInfo.acadYear = document.getElementById('acadYearFilter')?.value || '';
      filterInfo.semester = document.getElementById('semesterFilter')?.value || '';
      filterInfo.year = document.getElementById('yearFilterLogs')?.value || '';
      const courseCode = document.getElementById('courseFilterLogs')?.value || '';
      filterInfo.courseFull = getProgramFullName(courseCode);
      filterInfo.remarks = document.getElementById('remarksFilter')?.value || '';
      filterInfo.status = document.getElementById('statusFilter')?.value || '';
      filterInfo.dateFrom = document.getElementById('dateFrom')?.value || '';
      filterInfo.dateTo = document.getElementById('dateTo')?.value || '';
    } else {
      // Home page
      const courseCode = document.getElementById('courseFilter')?.value || '';
      filterInfo.courseFull = getProgramFullName(courseCode);
      filterInfo.year = document.getElementById('yearFilter')?.value || '';
      filterInfo.acadYear = document.getElementById('acadYearFilterHome')?.value || '';
      filterInfo.gender = document.getElementById('genderFilterHome')?.value || '';
      filterInfo.dateFrom = document.getElementById('dateFrom')?.value || '';
      filterInfo.dateTo = document.getElementById('dateTo')?.value || '';
    }

    showPrintDialog(headers, bodyRows, title, filterInfo);

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