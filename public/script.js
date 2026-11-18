// ==================== GLOBAL VARIABLES ====================
let allStudents = [];                                     // main student data array
let clearanceLogs = [];                                   // main clearance logs array
let programs = [];                                        // new: store programs
let pendingDeleteRfids = [];                              // for home page delete confirmation               
let homeSort = { column: 3, direction: 'asc' };           // default sort by Name (index 2, after adding checkbox column)
let logSort = { column: 1, direction: 'asc' };            // default sort by Student name (index 1)
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
let pendingReReleaseStudentNumber = null;                  // for the re-release confirmation (lost clearance form)

const REMARKS_OPTIONS = ['None', 'Graduating', 'Moving Up', 'Transferring', 'Returning', 'Transfer', 'Drop', 'Others'];
const REMARKS_OTHERS = 'Others';                          // the remark that requires a note
const EXPORT_CREDIT = 'This is system-generated. Exported from Clearance Monitoring™';

// ==================== CREDITS (reads credits.txt) ====================
// credits.txt format, one person per line:   Role : Name
// A role listed on several lines is grouped together. A line starting with "Copyright" is shown last.
function renderCredits(container, text) {
  const groups = new Map();
  let copyright = '';

  text.split(/\r?\n/).map(line => line.trim()).forEach(line => {
    if (!line || /^[-=\s]+$/.test(line) || /^credits$/i.test(line)) return;
    if (/^copyright/i.test(line)) { copyright = line; return; }
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const role = line.slice(0, colon).trim();
    const name = line.slice(colon + 1).trim();
    if (!role || !name) return;
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(name);
  });

  container.textContent = '';
  groups.forEach((names, role) => {
    const roleEl = document.createElement('div');
    roleEl.className = 'credits-role';
    roleEl.textContent = role;
    container.appendChild(roleEl);
    names.forEach(name => {
      const nameEl = document.createElement('div');
      nameEl.className = 'credits-name';
      nameEl.textContent = name;
      container.appendChild(nameEl);
    });
  });
  if (copyright) {
    const copyEl = document.createElement('div');
    copyEl.className = 'credits-copy';
    copyEl.textContent = copyright;
    container.appendChild(copyEl);
  }
}

// ==================== NAVIGATION (one list drives every page's sidebar) ====================
// Items a role is not allowed to see are never put on the page at all.
const NAV_ITEMS = [
  { label: 'Student List',    href: 'home.html',              roles: ['admin', 'superadmin'] },
  { label: 'Registration',    href: 'registrationPage.html',  roles: ['user', 'admin', 'superadmin'] },
  { label: 'Status Update',   href: 'statusupdate.html',      roles: ['admin', 'superadmin'] },
  { label: 'Clearance Logs',  href: 'clearanceTracking.html', roles: ['admin', 'superadmin'] },
  { label: 'Manage Programs', href: 'admin.html',             roles: ['admin', 'superadmin'] },
  { label: 'Manage Accounts', href: 'superadmin.html',        roles: ['superadmin'], pendingBadge: true }
];
const ROLE_HOME = { user: 'registrationPage.html', admin: 'home.html', superadmin: 'home.html' };
const ROLE_LABELS = { superadmin: 'ITC', admin: 'Admin', user: 'User' };

// ==================== EXCEL LIBRARY (loaded only when needed) ====================
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let xlsxLoading = null;

function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxLoading) {
    xlsxLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = XLSX_URL;
      script.onload = resolve;
      script.onerror = () => { xlsxLoading = null; reject(new Error('Could not load the Excel library. Check your internet connection.')); };
      document.head.appendChild(script);
    });
  }
  return xlsxLoading;
}

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
        window.location.href = ROLE_HOME[role] || 'index.html';
        return;
      }
      currentUserRole = role;
      document.body.classList.add(`role-${role}`);
      updateSidebarForRole(role);
      showAccountInTopBar(profile);
      if (role === 'superadmin') loadPendingAccountsBadge();
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
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.nav').forEach(el => el.remove());
  const spacer = sidebar.querySelector('.sidebar-spacer');
  const currentPage = window.location.pathname.split('/').pop() || 'home.html';

  NAV_ITEMS.filter(item => item.roles.includes(role)).forEach(item => {
    const el = document.createElement('div');
    el.className = 'nav' + (item.href === currentPage ? ' active' : '');
    el.setAttribute('role', 'link');
    el.tabIndex = 0;
    el.textContent = item.label;

    const go = () => { window.location.href = item.href; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });

    if (item.pendingBadge) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.hidden = true;
      badge.title = 'Accounts waiting for approval';
      el.appendChild(badge);
    }
    sidebar.insertBefore(el, spacer);
  });
}

// ---- "accounts waiting for approval" counter on MANAGE ACCOUNTS (superadmin only)
const PENDING_CACHE_KEY = 'pendingAccountsCache';
const PENDING_CACHE_MS = 2 * 60 * 1000;   // reuse the count for 2 minutes instead of re-reading on every page

function applyPendingBadge(count) {
  document.querySelectorAll('.nav-badge').forEach(badge => {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  });
}

function setPendingBadge(count) {
  try { sessionStorage.setItem(PENDING_CACHE_KEY, JSON.stringify({ count, at: Date.now() })); } catch (e) { /* storage unavailable */ }
  applyPendingBadge(count);
}

async function loadPendingAccountsBadge() {
  // The Account Management page already loads every user and sets the badge itself
  if (window.location.pathname.includes('superadmin.html')) return;
  try {
    const cached = JSON.parse(sessionStorage.getItem(PENDING_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < PENDING_CACHE_MS) {
      applyPendingBadge(cached.count);
      return;
    }
    const snapshot = await getDocs(query(collection(db, 'users'), where('approved', '==', false), limit(100)));
    setPendingBadge(snapshot.size);
  } catch (err) {
    console.warn('Could not load pending account count:', err);
  }
}

// ==================== STUDENT LOOKUPS ====================
// A student is identified by the STUDENT NUMBER (it never changes). The RFID number is just the
// current ID card: it changes every year, so it is stored as a normal field and never used as the
// identity. New student records use the student number as the document ID; older records may
// still have their old RFID as the document ID, so every lookup goes through a query.
async function findStudentByNumber(studentNumber) {
  if (!studentNumber) return null;
  const snap = await getDocs(query(collection(db, 'students'), where('studentNumber', '==', studentNumber)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function findStudentByRfid(rfid) {
  if (!rfid) return null;
  const snap = await getDocs(query(collection(db, 'students'), where('rfidNumber', '==', rfid)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// A card that was replaced by a newer one is kept in previousRfids
async function findStudentByOldRfid(rfid) {
  if (!rfid) return null;
  const snap = await getDocs(query(collection(db, 'students'), where('previousRfids', 'array-contains', rfid)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function isValidRfid(rfid) {
  return /^\d{1,10}$/.test(rfid);
}

// The list of old RFID numbers after a student gets a new card
function buildPreviousRfids(student, newRfid) {
  const list = Array.isArray(student.previousRfids) ? [...student.previousRfids] : [];
  if (student.rfidNumber && student.rfidNumber !== newRfid && !list.includes(student.rfidNumber)) {
    list.push(student.rfidNumber);
  }
  return list.filter(r => r !== newRfid).slice(-20);
}

// true when another student (not excludeDocId) already has this student number
async function isStudentNumberDuplicate(studentNumber, excludeDocId = null) {
  const found = await findStudentByNumber(studentNumber);
  return !!found && found.id !== excludeDocId;
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
    showMessageModal('Failed to update students using this program: ' + friendlyError(err));
  }
}

// ==================== PAGE INIT ====================
// Data loading happens in each page's own script, after checkPageAccess() resolves.
document.addEventListener('DOMContentLoaded', function() {
  buildTopBar();
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

  const usernameInput = document.getElementById('username');
  if (usernameInput) {
    usernameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('password').focus(); }
    });
  }
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); login(); }
    });
  }

  applyTheme();
  applyAppearance();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  initPhotoDrop();

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
    showMessageModal('Failed to load students: ' + friendlyError(err));
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
  } catch (err) {
    console.error('Failed to load clearance logs:', err);
    showMessageModal('Failed to load clearance logs: ' + friendlyError(err));
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
  clearErrorsIn(document.getElementById('addProgramModal'));
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

  const prefix = 'new';
  if (!code) showFieldError(prefix + 'ProgramCode');
  if (!name) showFieldError(prefix + 'ProgramName');
  if (!code || !name) {
    focusFirstError();
    return;
  }

  name = formatProgramName(name);

  if (!/^[A-Za-z]+$/.test(code)) {
    showFieldError(prefix + 'ProgramCode', 'Program code can only have letters, for example BSIT.');
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
    showMessageModal('Error adding program: ' + friendlyError(err));
  }
}

function editProgram(id) {
  const program = programs.find(p => p.id === id);
  if (!program) return;
  clearErrorsIn(document.getElementById('editProgramModal'));
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

  const prefix = 'edit';
  if (!code) showFieldError(prefix + 'ProgramCode');
  if (!name) showFieldError(prefix + 'ProgramName');
  if (!code || !name) {
    focusFirstError();
    return;
  }

  name = formatProgramName(name);

  if (!/^[A-Za-z]+$/.test(code)) {
    showFieldError(prefix + 'ProgramCode', 'Program code can only have letters, for example BSIT.');
    return;
  }

  // If the code changed, you need to decide whether to allow it.
  // For simplicity, we'll disallow changing the code.
  if (code !== oldProgram.programCode) {
    showFieldError('editProgramCode', 'The program code cannot be changed. Delete and re-add the program instead.');
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
    showMessageModal('Error updating program: ' + friendlyError(err));
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
  if (pendingVerifySave) {
    closeConfirmModal();
    await saveVerification();
  } else if (pendingRemovePhotoLogId) {
    await confirmRemovePhoto();
  } else if (pendingDeleteRfids.length > 0) {
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
      showMessageModal('Error: ' + friendlyError(err));
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
    showMessageModal('Error deleting program: ' + friendlyError(err));
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
    setPendingBadge(users.filter(u => !u.approved).length);
    sortUsers(); 
    renderUsersTable();
  } catch (err) {
    showMessageModal('Failed to load users: ' + friendlyError(err));
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
          ${!user.approved ? `<button onclick="showApproveConfirm('${uid}')" class="btn-primary" style="margin-right:5px;">Approve</button>` : ''}
          <select id="role-${uid}" style="margin-right:5px; width:auto; height:24px; font-size:13px;">
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
  if (auth.currentUser && uid === auth.currentUser.uid) {
    showMessageModal('You cannot delete your own account.\nAsk another superadmin to do it if it is really needed.');
    return;
  }
  pendingUserAction = { uid, action: 'delete' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to delete this user from Firestore? (Authentication account will remain.)';
  document.getElementById('confirmModal').style.display = 'flex';
}

function showUpdateRoleConfirm(uid) {
  const select = document.getElementById(`role-${uid}`);
  const newRole = select.value;
  const target = users.find(u => u.uid === uid);
  const currentRole = target ? (target.role || 'user') : 'user';

  if (newRole === currentRole) {
    showMessageModal(`This account's role is already set to ${newRole}. Choose a different role first.`);
    return;
  }

  // A superadmin lowering their own role would lock themselves out of this page
  if (auth.currentUser && uid === auth.currentUser.uid && newRole !== 'superadmin') {
    select.value = currentRole;   // put the dropdown back
    showMessageModal(
      'You cannot lower your own role.\n\n' +
      'You are signed in as a superadmin, and changing this would remove your access to Account Management. ' +
      'Ask another superadmin to change your role if it is really needed.'
    );
    return;
  }

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
          <button onclick="deleteSingleStudent('${escapeHtml(student.id)}')" class="delete-btn" style="padding:2px 8px;">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
  updateAdminSortIndicators();
  filterAdminTable(); 
}

function deleteSingleStudent(docId) {
  pendingAdminDelete = [docId];
  document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this student?';
  document.getElementById('confirmModal').style.display = 'flex';
}

function editStudent(docId) {
  window.location.href = `registrationPage.html?docId=${encodeURIComponent(docId)}`;
}

async function confirmAdminDelete() {
  const docIds = [...pendingAdminDelete];
  closeConfirmModal();
  try {
    const promises = docIds.map(docId => deleteDoc(doc(db, 'students', docId)));
    await Promise.all(promises);
    loadStudents();           // reload students for both tables
    if (window.location.pathname.includes('admin.html')) {
      renderAdminStudentsTable();
    }
    showMessageModal('Selected students deleted.');
  } catch (err) {
    showMessageModal('Delete failed: ' + friendlyError(err));
  }
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingDeleteRfids = [];
  pendingAdminDelete = [];
  pendingDeleteProgramId = null;
  pendingDeleteLogIds = [];
  pendingVerifySave = false;
  pendingRemovePhotoLogId = null;
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
    showMessageModal('Delete failed: ' + friendlyError(err));
  }
}

function populateStudentFilters() {
  fillFilterSelect('acadYearFilterHome', new Set(allStudents.map(s => s.academicYear).filter(Boolean)));
}

// ==================== RENDERING CLEARANCE LOGS TABLE ====================
// Dates show as "Nov 16, 2026" with the time underneath, so a date column stays narrow.
function formatLogDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp.seconds * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) +
    '\n' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}

// "Remarks: note" text for a log ("Others" shows the note that was typed in)
function logRemarksText(log) {
  return log.remarks === REMARKS_OTHERS && log.remarksNote ? `${log.remarks}: ${log.remarksNote}` : log.remarks;
}

// Two lines in one cell: main text, then a muted detail line
function twoLineCell(main, detail) {
  return `<div>${escapeHtml(main)}</div>` + (detail ? `<div class="cell-sub">${escapeHtml(detail)}</div>` : '');
}

function dateCell(timestamp) {
  const [date, time] = formatLogDate(timestamp).split('\n');
  return date ? twoLineCell(date, time) : '';
}

// Every re-release is kept as { date, comment }. Forms re-released before the history was kept only have
// a count and the last date, so that date is shown as one entry and the rest are counted as unrecorded.
function reReleaseHistory(log) {
  const total = log.reReleaseCount || 0;
  const entries = (log.reReleases || []).map(r => ({ date: r.date, comment: r.comment }));
  if (entries.length === 0 && total > 0 && log.lastReReleasedDate) entries.push({ date: log.lastReReleasedDate, comment: '' });
  return { total, entries, unrecorded: Math.max(0, total - entries.length) };
}

// HTML list of every re-release: total first, then one line per re-release with its comment
function reReleaseHtml(log) {
  const { total, entries, unrecorded } = reReleaseHistory(log);
  if (total === 0) return '';
  return `<div class="rr-total">${total}× re-released</div>` +
    (unrecorded ? `<div class="cell-sub">${unrecorded} earlier, no details recorded</div>` : '') +
    entries.map((e, i) => {
      const n = unrecorded + i + 1;
      return `<div class="rr-entry"><span class="rr-num">#${n}</span> ${escapeHtml(formatLogDate(e.date).replace('\n', ' · '))}` +
        (e.comment ? `<div class="cell-sub">${escapeHtml(e.comment)}</div>` : '') + `</div>`;
    }).join('');
}

function renderClearanceLogs(logs, keepSort = false) {
  const tbody = document.querySelector('#clearanceLogTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortLogs(logs, logSort.column, logSort.direction) : logs;
  tbody.innerHTML = data.map(log => {
    // Date range filter works on the release date, in Philippines time
    const filterDate = log.claimedDate ? toPhDateString(new Date(log.claimedDate.seconds * 1000)) : '';
    const reReleaseCount = log.reReleaseCount || 0;
    const remarksText = logRemarksText(log);
    const reReleaseCell = reReleaseHtml(log);
    const statusClass = log.status === 'Returned' ? 'status-returned' : 'status-claimed';
    return `
      <tr data-date="${escapeHtml(filterDate)}" data-remarks="${escapeHtml(log.remarks)}" data-status="${escapeHtml(log.status)}"
          data-semester="${escapeHtml(log.semester)}" data-ay="${escapeHtml(log.academicYear)}"
          data-year="${escapeHtml(log.yearLevel)}" data-course="${escapeHtml(log.program)}" data-rereleases="${reReleaseCount}"
          data-verified="${log.verified ? 'yes' : (log.status === 'Returned' ? 'no' : '')}">
        <td style="text-align: center;">
          <input type="checkbox" class="log-checkbox" data-log-id="${escapeHtml(log.id)}" onchange="updateSelectAllLogsState()">
        </td>
        <td>${twoLineCell(log.name, `${log.studentNumber} · RFID ${log.rfid}`)}</td>
        <td>${twoLineCell(log.academicYear, log.semester)}</td>
        <td>${twoLineCell(log.program, log.yearLevel)}</td>
        <td>${dateCell(log.claimedDate)}</td>
        <td>${dateCell(log.returnedDate)}</td>
        <td>${reReleaseCell}</td>
        <td title="${escapeHtml([remarksText, log.comment].filter(Boolean).join(' — '))}">${twoLineCell(remarksText, log.comment)}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(log.status)}</span></td>
        <td>${verificationCell(log)}</td>
      </tr>
    `;
  }).join('');
  applyFilters();
}

// ==================== RETURNED FORM PHOTO (VERIFICATION) ====================
// A returned log can get a photo of the clearance form, which marks it "Verified". The photo is a
// compressed JPEG kept in its own collection (clearancePhotos/{logId}) so loading the log list stays
// fast. It is only a check on the returned status and is never part of any export.
const PHOTO_MAX_SIDE = 1400;       // longest side in pixels after compressing
const PHOTO_QUALITY = 0.7;
const PHOTO_MAX_CHARS = 900000;    // a Firestore document holds 1 MiB; firestore.rules enforces the same limit
let verifyLogId = null;
let verifyPhotoData = null;
let pendingVerifySave = false;       // confirm dialog is asking to save the photo
let pendingRemovePhotoLogId = null;  // confirm dialog is asking to remove this log's photo

function verificationCell(log) {
  if (log.status !== 'Returned') return '';
  const id = escapeHtml(log.id);
  if (log.verified) {
    return `<span class="status-badge status-verified">Verified</span>` +
      `<button type="button" class="photo-btn" onclick="viewLogPhoto('${id}')">View photo</button>`;
  }
  return `<button type="button" class="photo-btn photo-btn-primary" onclick="openVerifyModal('${id}')">Add photo</button>`;
}

async function compressPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('The selected file is not an image.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
  if (data.length > PHOTO_MAX_CHARS) throw new Error('The photo is too detailed to save. Take it again with the form filling the frame.');
  return data;
}

function openVerifyModal(logId) {
  const log = clearanceLogs.find(l => l.id === logId);
  if (!log) throw new Error('Clearance log not found: ' + logId);
  verifyLogId = logId;
  verifyPhotoData = null;
  document.getElementById('verifyStudent').textContent = `${log.name} · ${log.studentNumber} · ${log.academicYear}, ${log.semester} semester`;
  document.getElementById('verifyPreview').style.display = 'none';
  document.getElementById('verifyPreviewEmpty').style.display = '';
  document.getElementById('verifySaveBtn').disabled = true;
  document.getElementById('verifyModal').style.display = 'flex';
}

function closeVerifyModal() {
  document.getElementById('verifyModal').style.display = 'none';
  verifyLogId = null;
  verifyPhotoData = null;
}

function onPhotoPicked(input) {
  const file = input.files[0];
  input.value = '';   // picking the same file again must still fire a change
  return usePhoto(file);
}

async function usePhoto(file) {
  if (!file) return;
  try {
    verifyPhotoData = await compressPhoto(file);
  } catch (err) {
    verifyPhotoData = null;
    document.getElementById('verifySaveBtn').disabled = true;
    showMessageModal('Could not use this photo: ' + err.message);
    return;
  }
  const preview = document.getElementById('verifyPreview');
  preview.src = verifyPhotoData;
  preview.style.display = 'block';
  document.getElementById('verifyPreviewEmpty').style.display = 'none';
  document.getElementById('verifySaveBtn').disabled = false;
}

// Desktop: drop a photo anywhere on the verify dialog. Dropping outside it must not make the browser open the file.
function initPhotoDrop() {
  const modal = document.getElementById('verifyModal');
  if (!modal) return;
  const zone = modal.querySelector('.photo-preview');
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  let depth = 0;
  modal.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    zone.classList.add('drag-over');
  });
  modal.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  modal.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    depth--;
    if (depth <= 0) { depth = 0; zone.classList.remove('drag-over'); }
  });
  modal.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length !== 1) { showMessageModal('Drop one photo at a time.'); return; }
    usePhoto(e.dataTransfer.files[0]);
  });
}

function askSaveVerification() {
  if (!verifyLogId || !verifyPhotoData) throw new Error('No log or photo selected.');
  pendingVerifySave = true;
  document.getElementById('confirmMessage').textContent = 'Save this photo and mark the returned form as verified?';
  document.getElementById('confirmModal').style.display = 'flex';
}

async function saveVerification() {
  if (isProcessing) return;
  if (!verifyLogId || !verifyPhotoData) throw new Error('No log or photo selected.');
  isProcessing = true;
  const saveBtn = document.getElementById('verifySaveBtn');
  saveBtn.disabled = true;
  try {
    const now = new Date();
    const batch = writeBatch(db);
    batch.set(doc(db, 'clearancePhotos', verifyLogId), { image: verifyPhotoData, uploadedAt: now, uploadedBy: auth.currentUser.uid });
    batch.update(doc(db, 'clearanceLogs', verifyLogId), { verified: true, verifiedAt: now });
    await batch.commit();
    const log = clearanceLogs.find(l => l.id === verifyLogId);
    log.verified = true;
    log.verifiedAt = { seconds: Math.floor(now.getTime() / 1000) };
    closeVerifyModal();
    renderClearanceLogs(clearanceLogs, true);
    showMessageModal('Photo saved. The returned form is now verified.');
  } catch (err) {
    saveBtn.disabled = false;
    showMessageModal('Could not save the photo: ' + friendlyError(err));
  } finally {
    isProcessing = false;
  }
}

async function viewLogPhoto(logId) {
  const log = clearanceLogs.find(l => l.id === logId);
  if (!log) throw new Error('Clearance log not found: ' + logId);
  verifyLogId = logId;
  const img = document.getElementById('photoViewImg');
  img.style.display = 'none';
  img.removeAttribute('src');
  document.getElementById('photoViewMeta').textContent = `${log.name} · ${log.studentNumber} · Verified ${formatLogDate(log.verifiedAt).replace('\n', ' ')}`;
  document.getElementById('photoReplaceBtn').style.display = currentUserRole === 'admin' ? 'none' : '';
  document.getElementById('photoRemoveBtn').style.display = currentUserRole === 'superadmin' ? '' : 'none';
  document.getElementById('photoViewModal').style.display = 'flex';
  try {
    const snap = await getDoc(doc(db, 'clearancePhotos', logId));
    if (!snap.exists()) throw new Error('The photo for this log could not be found.');
    img.src = snap.data().image;
    img.style.display = 'block';
  } catch (err) {
    closePhotoViewModal();
    showMessageModal('Could not load the photo: ' + friendlyError(err));
  }
}

function closePhotoViewModal() {
  document.getElementById('photoViewModal').style.display = 'none';
  document.getElementById('photoViewImg').removeAttribute('src');
}

function askRemovePhoto() {
  if (currentUserRole !== 'superadmin') throw new Error('Only the superadmin can remove a photo.');
  pendingRemovePhotoLogId = verifyLogId;
  document.getElementById('confirmMessage').textContent = 'Remove this photo? The log will become unverified and must be verified again.';
  document.getElementById('confirmModal').style.display = 'flex';
}

async function confirmRemovePhoto() {
  const logId = pendingRemovePhotoLogId;
  closeConfirmModal();
  closePhotoViewModal();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'clearancePhotos', logId));
    batch.update(doc(db, 'clearanceLogs', logId), { verified: false, verifiedAt: null });
    await batch.commit();
    const log = clearanceLogs.find(l => l.id === logId);
    log.verified = false;
    log.verifiedAt = null;
    renderClearanceLogs(clearanceLogs, true);
    showMessageModal('Photo removed. The log is no longer verified.');
  } catch (err) {
    showMessageModal('Could not remove the photo: ' + friendlyError(err));
  }
}

function replaceLogPhoto() {
  const logId = verifyLogId;
  closePhotoViewModal();
  openVerifyModal(logId);
}

// ==================== SORTING ====================
function getSortProperty(columnIndex, isLogTable) {
  if (isLogTable) {
    // Clearance logs table: 0=checkbox, 1=STUDENT, 2=A.Y./SEM, 3=COURSE/YEAR, 4=RELEASED,
    // 5=RECEIVED, 6=RE-RELEASED, 7=REMARKS, 8=STATUS, 9=VERIFICATION
    const map = {
      1: 'name',
      2: 'academicYear',
      3: 'program',
      4: 'claimedDate',
      5: 'returnedDate',
      6: 'lastReReleasedDate',
      7: 'remarks',
      8: 'status',
      9: 'verifiedAt'
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
    if (prop === 'claimedDate' || prop === 'returnedDate' || prop === 'lastReReleasedDate' || prop === 'verifiedAt') {
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
  if (isEditMode) return;   // while editing, the RFID field is the value being changed
  const rfid = document.getElementById('rfidNumber').value.trim();
  if (!rfid) return;
  try {
    const existing = await findStudentByRfid(rfid);
    if (existing) {
      // This card already belongs to a student: open that student for editing
      setupEditMode(existing.id);
    } else {
      document.getElementById('rfidNumber').disabled = false;
      document.getElementById('studentNumber').disabled = false;
      document.getElementById('surname').disabled = false;
      document.getElementById('firstName').disabled = false;
      document.getElementById('middleName').disabled = false;
      document.getElementById('date').disabled = false;
      const btn = document.getElementById('registerButton');
      btn.textContent = 'Register';
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
    const hasRfid = !!student.studentNumber;
    const studentType = hasRfid ? 'new' : 'old';

    // Set the hidden field and switch tab
    document.getElementById('studentType').value = studentType;
    if (studentType === 'new') {
      switchRegistrationTab('new');
      document.getElementById('rfidNumber').value = student.rfidNumber || '';
      document.getElementById('studentNumber').value = student.studentNumber || '';
      document.getElementById('rfidNumber').disabled = false;       // a new ID card = new RFID number
      document.getElementById('studentNumber').disabled = true;     // the student number never changes
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
    populateAcademicYearDropdown(studentType, student.academicYear || '');
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
    btn.textContent = 'Update';
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
    focusFirstError();
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
    showMessageModal('Registration failed: ' + friendlyError(err));
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
    registerBtn.textContent = 'Register';
    // Reset form for new student (optional)
    resetRegistrationForm();
  } else {
    newFields.style.display = 'none';
    rfidInput.disabled = true;
    studentNumberInput.disabled = true;
    registerBtn.onclick = registerOldStudent;
    registerBtn.textContent = 'Register Old Student';
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
    showFieldError('date', 'Date must be today\'s date.');
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
    focusFirstError();
    return;
  }

  if (studentType === 'new') {
    if (!isValidRfid(formData.rfidNumber)) {
      showFieldError('rfidNumber', 'RFID number is 1 to 10 digits, for example 0012345678.');
      return;
    }
    // The RFID must not belong to a different student
    const rfidOwner = await findStudentByRfid(formData.rfidNumber);
    if (rfidOwner && rfidOwner.id !== docId) {
      showFieldError('rfidNumber', `This RFID number is already assigned to ${formatFullName(rfidOwner)} (${rfidOwner.studentNumber}).`);
      return;
    }
    if (!isValidStudentNumber(formData.studentNumber)) {
      showFieldError('studentNumber', 'Student number is one letter followed by 6 digits, for example C123456.');
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

    // Same student number, new ID card: only the RFID changes, everything else stays as it was
    if (formData.kind === 'rfidChange') {
      await updateDoc(docRef, {
        rfidNumber: formData.rfidNumber,
        previousRfids: buildPreviousRfids(currentStudent, formData.rfidNumber)
      });
      document.getElementById('updateSuccessMessage').innerText = 'RFID number updated. All other student details were kept.';
      document.getElementById('updateSuccessModal').style.display = 'flex';
      return;
    }

    const changes = {
      surname: formData.surname,
      firstName: formData.firstName,
      middleName: formData.middleName,
      program: formData.program,
      yearLevel: formData.yearLevel,
      gender: formData.gender,
      academicYear: formData.academicYear
    };

    // The student number is fixed; the RFID number may change (new ID card)
    if (formData.rfidNumber && formData.rfidNumber !== currentStudent.rfidNumber) {
      changes.rfidNumber = formData.rfidNumber;
      changes.previousRfids = buildPreviousRfids(currentStudent, formData.rfidNumber);
    }

    await updateDoc(docRef, changes);

    document.getElementById('updateSuccessMessage').innerText = 'Update successful!';
    document.getElementById('updateSuccessModal').style.display = 'flex';
  } catch (err) {
    if (err.code === 'permission-denied') {
      showMessageModal('Update not allowed: some fields cannot be changed.');
    } else {
      showMessageModal('Update failed: ' + friendlyError(err));
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
    focusFirstError();
    return;
  }

  if (!isValidStudentNumber(formData.studentNumber)) {
    showFieldError('studentNumber', 'Student number is one letter followed by 6 digits, for example C123456.');
    return;
  }
  if (!isValidRfid(formData.rfidNumber)) {
    showFieldError('rfidNumber', 'RFID number is 1 to 10 digits, for example 0012345678.');
    return;
  }

  try {
    const sameNumber = await findStudentByNumber(formData.studentNumber);
    const sameRfid = await findStudentByRfid(formData.rfidNumber);

    // The RFID card is already assigned to somebody else
    if (sameRfid && (!sameNumber || sameRfid.id !== sameNumber.id)) {
      showFieldError('rfidNumber', `This RFID number is already assigned to ${formatFullName(sameRfid)} (${sameRfid.studentNumber}).`);
      return;
    }

    if (sameNumber) {
      if (sameNumber.rfidNumber === formData.rfidNumber) {
        showFieldError('studentNumber', `${formatFullName(sameNumber)} (${sameNumber.studentNumber}) is already registered with this RFID number.`);
        return;
      }
      // Changing the RFID of an existing student is an update, which only admins can do
      if (typeof currentUserRole !== 'undefined' && currentUserRole === 'user') {
        showFieldError('studentNumber', `Student number ${sameNumber.studentNumber} is already registered to ${formatFullName(sameNumber)}. Please ask an admin to update their RFID number.`);
        return;
      }
      // Existing student with a new ID card: ask before changing the RFID. Nothing else is overwritten.
      window.pendingUpdateData = {
        kind: 'rfidChange',
        docId: sameNumber.id,
        rfidNumber: formData.rfidNumber
      };
      document.getElementById('updateConfirmMessage').innerText =
        `Student number ${sameNumber.studentNumber} is already registered to ${formatFullName(sameNumber)}.\n\n` +
        `Change their RFID number from ${sameNumber.rfidNumber || '(none)'} to ${formData.rfidNumber}?\n` +
        `Their other details will not be changed.`;
      document.getElementById('updateConfirmModal').style.display = 'flex';
      return;
    }
  } catch (err) {
    console.error('Duplicate check error:', err);
    showMessageModal('Could not check existing students: ' + friendlyError(err));
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
    // The student number is the document ID, so the same student can never be registered twice
    await setDoc(doc(db, 'students', formData.studentNumber), student);
    resetRegistrationForm();
    document.getElementById('successModal').style.display = 'flex';
  } catch (err) {
    if (err.code === 'permission-denied') {
      showMessageModal('Permission denied. Check Firestore security rules.');
    } else if (err.code === 'already-exists') {
      showMessageModal('Student number already exists.');
    } else {
      showMessageModal('Registration failed: ' + friendlyError(err));
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
  btn.textContent = 'Register';
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
// ==================== FORM FIELD ERRORS ====================
// A field error is a red field plus a message right under it. Messages are removed again as soon as the user edits the field.
const REQUIRED_MESSAGES = {
  rfidNumber: 'Enter the RFID number.',
  studentNumber: 'Enter the student number, for example C123456.',
  surname: 'Enter the surname.',
  firstName: 'Enter the first name.',
  program: 'Select a program.',
  yearLevel: 'Select a year level.',
  academicYear: 'Select an academic year.',
  gender: 'Select a gender.',
  regSchoolId: 'Enter your school ID.',
  regFirstName: 'Enter your first name.',
  regLastName: 'Enter your last name.',
  regEmail: 'Enter your email address.',
  regPassword: 'Create a password.',
  regConfirmPassword: 'Re-enter your password to confirm it.',
  resetEmail: 'Enter the email address of your account.',
  username: 'Enter your email address.',
  password: 'Enter your password.',
  newProgramCode: 'Enter the program code.',
  newProgramName: 'Enter the program name.',
  editProgramCode: 'Enter the program code.',
  editProgramName: 'Enter the program name.',
  rfidSearch: 'Enter an RFID or student number.',
  updateSemester: 'Select a semester.',
  updateRemarksNote: 'Enter the remarks for "Others".'
};

function showFieldError(fieldId, message = REQUIRED_MESSAGES[fieldId]) {
  const input = document.getElementById(fieldId);
  clearFieldError(fieldId);
  input.classList.add('error-field');
  input.setAttribute('aria-invalid', 'true');
  if (!message) return;
  const el = document.createElement('div');
  el.id = fieldId + '-error';
  el.className = 'field-error';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  // Inline rows (search box + buttons) keep the message under the whole row
  (input.closest('.search-row-inline') || input).insertAdjacentElement('afterend', el);
  input.setAttribute('aria-describedby', el.id);
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.classList.remove('error-field');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  const el = document.getElementById(fieldId + '-error');
  if (el) el.remove();
}

function clearErrorsIn(container) {
  container.querySelectorAll('[aria-invalid]').forEach(input => clearFieldError(input.id));
  container.querySelectorAll('.form-alert').forEach(el => { el.hidden = true; });
}

function clearAllFieldErrors() {
  clearErrorsIn(document.querySelector('.registration-layout') || document.body);
}

// A message that is about the whole form, not one field (shown at the top of the form)
function showFormAlert(alertId, message) {
  const el = document.getElementById(alertId);
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest' });
}

function focusFirstError() {
  const first = document.querySelector('[aria-invalid="true"]');
  if (first) first.focus();
}

// Turns a Firebase / network error into a sentence that says what to do next
function friendlyError(err) {
  const code = err.code || '';
  if (code === 'permission-denied') return 'You do not have permission to do this. Ask the ITC if you think this is a mistake.';
  if (code === 'unauthenticated') return 'Your session has expired. Log in again.';
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'The server cannot be reached. Check your internet connection and try again.';
  if (code === 'resource-exhausted') return 'The system is busy right now. Try again in a few minutes.';
  return err.message;
}

// Editing a field clears its error straight away
['input', 'change'].forEach(type => document.addEventListener(type, e => {
  if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') clearFieldError(e.target.id);
}));

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
  clearFieldError('rfidSearch');
  if (!input) {
    showFieldError('rfidSearch');
    return;
  }
  if (!/^[A-Z0-9]{1,10}$/.test(input)) {
    showFieldError('rfidSearch', 'Use up to 10 letters or digits, for example C123456.');
    return;
  }

  try {
    // The card number (RFID) or the student number can be typed or scanned
    let student = await findStudentByRfid(input);
    if (!student) student = await findStudentByNumber(input);

    if (student) {
      currentStudentForUpdate = student;
      await displayStudentForUpdate(student);
    } else {
      const replaced = await findStudentByOldRfid(input);
      if (replaced) {
        showMessageModal(`This RFID number is from an old ID card of ${formatFullName(replaced)} (${replaced.studentNumber}). Please use the new ID card or enter the student number.`);
      } else {
        showFieldError('rfidSearch', 'No student found with that RFID or student number. Check the number and try again.');
      }
    }
  } catch (err) {
    console.error('Search error:', err);
    showMessageModal('Error searching for student.');
  }
}

async function displayStudentForUpdate(student) {
  const container = document.getElementById('studentResult');
  const fullName = formatFullName(student);

  // A released-but-not-received form keeps the remarks, note and semester it was released with
  const openClaim = await findOpenClaim(student.studentNumber);
  const selectedRemarks = openClaim ? openClaim.remarks || 'None' : 'None';
  const selectedSemester = openClaim ? openClaim.semester || '1st' : '1st';
  const noteValue = openClaim ? openClaim.remarksNote || '' : '';
  const commentValue = openClaim ? openClaim.comment || '' : '';

  const remarksOptions = REMARKS_OPTIONS.map(option =>
    `<option value="${option}" ${option === selectedRemarks ? 'selected' : ''}>${option}</option>`
  ).join('');

  const semesterOptions = `
    <option value="" disabled>Select Semester</option>
    <option value="1st" ${selectedSemester === '1st' ? 'selected' : ''}>1st Semester</option>
    <option value="2nd" ${selectedSemester === '2nd' ? 'selected' : ''}>2nd Semester</option>
  `;

  const claimRow = openClaim ? `
        <tr><th>Clearance Form</th><td>Released on ${escapeHtml(new Date(openClaim.claimedDate.seconds * 1000).toLocaleString())}${openClaim.reReleaseCount ? ` (re-released ${escapeHtml(openClaim.reReleaseCount)}×)` : ''}</td></tr>` +
    (openClaim.reReleaseCount ? `
        <tr><th>Re-releases</th><td class="rr-list">${reReleaseHtml(openClaim)}</td></tr>` : '') : '';

  const reReleaseButton = openClaim
    ? `<button class="btn-rerelease" onclick="showReReleaseConfirm('${escapeHtml(student.studentNumber)}')">Re-release</button>`
    : '';

  container.style.display = 'block';
  container.innerHTML = `
    <div class="student-details">
      <table class="student-info-table">
        <tr><th>Name</th><td>${escapeHtml(fullName)}</td></tr>
        <tr><th>Program</th><td>${escapeHtml(student.program)}</td></tr>
        <tr><th>Year Level</th><td>${escapeHtml(student.yearLevel)}</td></tr>
        <tr><th>Student Number</th><td>${escapeHtml(student.studentNumber)}</td></tr>
        <tr><th>Academic Year</th><td>${escapeHtml(student.academicYear)}</td></tr>
        <tr><th>Gender</th><td>${escapeHtml(student.gender)}</td></tr>${claimRow}
      </table>

      <div class="button-group">
        <button class="btn-release" onclick="releaseStudent('${escapeHtml(student.studentNumber)}')">Release</button>
        <button class="btn-receive" onclick="receiveStudent('${escapeHtml(student.studentNumber)}')">Receive</button>
        ${reReleaseButton}
      </div>

      <div class="dropdown-group">
        <div class="dropdown-item">
          <label>Remarks</label>
          <select id="updateRemarks" class="remarks-select" onchange="toggleRemarksNote()">
            ${remarksOptions}
          </select>
        </div>
        <div class="dropdown-item">
          <label>Semester</label>
          <select id="updateSemester" class="semester-select">
            ${semesterOptions}
          </select>
        </div>
      </div>

      <div class="dropdown-item remarks-note-row" id="remarksNoteRow" style="${selectedRemarks === REMARKS_OTHERS ? '' : 'display: none;'}">
        <label for="updateRemarksNote">Remarks <span class="required">*</span></label>
        <input type="text" id="updateRemarksNote" class="remarks-note" maxlength="100"
               placeholder="Specify the remark (e.g. Shifting course)" autocomplete="off" value="${escapeHtml(noteValue)}">
      </div>

      <div class="dropdown-item comment-row">
        <label for="updateComment">Comment</label>
        <textarea id="updateComment" class="remarks-note" maxlength="200" rows="2"
                  placeholder="Optional comment" autocomplete="off">${escapeHtml(commentValue)}</textarea>
      </div>
    </div>
  `;

  attachStatusUpdateHoverScroll();
}

function toggleRemarksNote() {
  const isOthers = document.getElementById('updateRemarks').value === REMARKS_OTHERS;
  document.getElementById('remarksNoteRow').style.display = isOthers ? '' : 'none';
  if (isOthers) document.getElementById('updateRemarksNote').focus();
}

// Reads and validates the remarks / note / semester inputs. Shows a message and returns null when invalid.
function readRemarksForm() {
  const remarks = document.getElementById('updateRemarks').value;
  const semester = document.getElementById('updateSemester').value;
  const note = remarks === REMARKS_OTHERS ? document.getElementById('updateRemarksNote').value.trim() : '';
  const comment = document.getElementById('updateComment').value.trim();

  clearFieldError('updateSemester');
  clearFieldError('updateRemarksNote');
  if (!semester) showFieldError('updateSemester');
  if (remarks === REMARKS_OTHERS && !note) showFieldError('updateRemarksNote');
  if (document.querySelector('#studentResult [aria-invalid="true"]')) {
    focusFirstError();
    return null;
  }
  return { remarks, semester, note, comment };
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

// Oldest academic year an old student can be registered under
const OLDEST_ACADEMIC_YEAR = 1980;

// 'new' (Current Student): a window around today, oldest first.
// 'old' (Old Student): every year from now back to OLDEST_ACADEMIC_YEAR, newest first.
// keepValue: a saved A.Y. that must always be selectable (editing a student), even outside the range.
function populateAcademicYearDropdown(tab = 'new', keepValue = '') {
  const select = document.getElementById('academicYear');
  if (!select) return;
  const previous = keepValue || select.value;
  const currentYear = new Date().getFullYear();

  const years = [];
  if (tab === 'old') {
    for (let year = currentYear; year >= OLDEST_ACADEMIC_YEAR; year--) years.push(year);
  } else {
    for (let year = currentYear - 5; year <= currentYear + 5; year++) years.push(year);
  }
  const values = years.map(year => `${year}-${year + 1}`);
  if (keepValue && !values.includes(keepValue)) values.push(keepValue);

  select.innerHTML = '<option value="" disabled selected>Select A.Y.</option>';
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  // keep the current choice when switching tabs, if it exists in the new list
  if (previous && values.includes(previous)) select.value = previous;
}

// ==================== CLEARANCE LOG HELPERS ====================
async function findOpenClaim(studentNumber) {
  // Looked up by student number (it never changes), so a form released with last year's card is still found.
  // Only equality filters are used, so no composite index is needed; the newest one is picked here.
  const q = query(
    collection(db, 'clearanceLogs'),
    where('studentNumber', '==', studentNumber),
    where('status', '==', 'Claimed'),
    where('returnedDate', '==', null)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const open = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.claimedDate?.seconds || 0) - (a.claimedDate?.seconds || 0));
  return open[0];
}

async function createReleaseLog(student, claimedDate, academicYear, semester, remarks, remarksNote, comment) {
  const fullName = formatFullName(student);
  const logData = {
    rfid: student.rfidNumber || '',            // the card the student had at the time
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
    remarksNote: remarksNote || '',
    comment: comment || '',
    reReleaseCount: 0,
    lastReReleasedDate: null,
    timestamp: new Date()
  };
  await addDoc(collection(db, 'clearanceLogs'), logData);
}

async function updateLogWithReturn(logId, returnedDate, newRemarks, newRemarksNote, newAcadYear, newSemester, newComment) {
  const updateData = {
    status: 'Returned',
    returnedDate: returnedDate,
    remarks: newRemarks,
    remarksNote: newRemarksNote,
    comment: newComment,
    academicYear: newAcadYear,
    semester: newSemester
  };
  await updateDoc(doc(db, 'clearanceLogs', logId), updateData);
}

function isValidAcademicYear(year) {
  return /^\d{4}-\d{4}$/.test(year);
}

// ==================== RELEASE STUDENT (Claimed) ====================
async function releaseStudent(studentNumber) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const form = readRemarksForm();
    if (!form) return;

    const student = await findStudentByNumber(studentNumber);
    if (!student) {
      showMessageModal('Student not found.');
      return;
    }

    // Validate that student has an academic year
    if (!student.academicYear) {
      showMessageModal('Student does not have an academic year set. Please update the student record first.');
      return;
    }

    const openClaim = await findOpenClaim(student.studentNumber);
    if (openClaim) {
      showMessageModal('Student has already claimed. Please return first.');
      return;
    }

    const now = new Date();
    await createReleaseLog(
      student,
      now,
      student.academicYear,   // <-- use student's stored academic year
      form.semester,
      form.remarks,
      form.note,
      form.comment
    );

    showMessageModal('Student clearance form released successfully.');
    clearStatusUpdate();
  } catch (err) {
    console.error('Release error:', err);
    showMessageModal('Release failed: ' + friendlyError(err));
  } finally {
    isProcessing = false;
  }
}

// ==================== RECEIVE STUDENT (Returned) ====================
async function receiveStudent(studentNumber) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const form = readRemarksForm();
    if (!form) return;

    const student = await findStudentByNumber(studentNumber);
    if (!student) {
      showMessageModal('Student not found.');
      return;
    }

    if (!student.academicYear) {
      showMessageModal('Student does not have an academic year set. Please update the student record first.');
      return;
    }

    const openClaim = await findOpenClaim(student.studentNumber);
    if (!openClaim) {
      showMessageModal('Student has yet to claim form. Please release first.');
      return;
    }

    const now = new Date();
    await updateLogWithReturn(
      openClaim.id,
      now,
      form.remarks,
      form.note,
      student.academicYear,   // <-- use student's stored academic year
      form.semester,
      form.comment
    );

    showMessageModal('Student clearance form has been returned successfully.');
    clearStatusUpdate();
  } catch (err) {
    console.error('Receive error:', err);
    showMessageModal('Receive failed: ' + friendlyError(err));
  } finally {
    isProcessing = false;
  }
}

// ==================== RE-RELEASE (lost clearance form) ====================
function showReReleaseConfirm(studentNumber) {
  pendingReReleaseStudentNumber = studentNumber;
  document.getElementById('reReleaseComment').value = '';
  document.getElementById('reReleaseModal').style.display = 'flex';
}

function closeReReleaseModal() {
  pendingReReleaseStudentNumber = null;
  document.getElementById('reReleaseModal').style.display = 'none';
}

async function confirmReReleaseStudent() {
  const studentNumber = pendingReReleaseStudentNumber;
  const comment = document.getElementById('reReleaseComment').value.trim();
  closeReReleaseModal();
  if (isProcessing) return;
  isProcessing = true;
  try {
    const openClaim = await findOpenClaim(studentNumber);
    if (!openClaim) {
      showMessageModal('Student has no released clearance form. Please release first.');
      return;
    }

    const now = new Date();
    await updateDoc(doc(db, 'clearanceLogs', openClaim.id), {
      reReleaseCount: (openClaim.reReleaseCount || 0) + 1,
      lastReReleasedDate: now,
      reReleases: [...(openClaim.reReleases || []), { date: now, comment }]
    });

    showMessageModal('Student clearance form re-released successfully.');
    clearStatusUpdate();
  } catch (err) {
    console.error('Re-release error:', err);
    showMessageModal('Re-release failed: ' + friendlyError(err));
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

// ==================== TOGGLE PASSWORD ====================
function togglePassword() {
  document.getElementById('password').type = event.target.checked ? 'text' : 'password';
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

// ==================== THEME ====================
// 'system' follows the device; 'dark' / 'light' are fixed. Stored per device.
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'dark',   label: 'Dark' },
  { id: 'light',  label: 'Light' }
];

function getTheme() {
  return localStorage.getItem('theme') || 'system';
}

function applyTheme() {
  const theme = getTheme();
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark-mode', dark);
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme();
  renderSettingsPanel();
}

// Text size, bold text and high contrast. Stored per device, like the theme.
const TEXT_SIZES = [
  { id: 'small',  label: 'Small',  scale: 0.9 },
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'large',  label: 'Large',  scale: 1.15 },
  { id: 'xlarge', label: 'Extra large', scale: 1.3 }
];

function getTextSize() {
  return localStorage.getItem('textSize') || 'normal';
}

function applyAppearance() {
  const size = TEXT_SIZES.find(t => t.id === getTextSize());
  if (!size) throw new Error('Unknown text size: ' + getTextSize());
  document.documentElement.style.setProperty('--text-scale', size.scale);
  document.body.classList.toggle('bold-text', localStorage.getItem('boldText') === 'on');
  document.body.classList.toggle('high-contrast', localStorage.getItem('highContrast') === 'on');
}

function setTextSize(id) {
  localStorage.setItem('textSize', id);
  applyAppearance();
  renderSettingsPanel();
}

function toggleAppearanceOption(key) {
  localStorage.setItem(key, localStorage.getItem(key) === 'on' ? 'off' : 'on');
  applyAppearance();
  renderSettingsPanel();
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
// Search boxes call this: wait for a short pause in typing before filtering the table
function debounceFilters() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(applyFilters, 150);
}

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
  const verificationFilter = document.getElementById('verificationFilter')?.value || '';

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
    if (searchInput && !row.textContent.toLowerCase().includes(searchInput)) {
      show = false;
    }

    if (show) {
      if (isLogTable) {
        const d = row.dataset;
        if (statusFilter && d.status !== statusFilter) show = false;
        if (show && semesterFilter && d.semester !== semesterFilter) show = false;
        if (show && remarksFilter && d.remarks !== remarksFilter) show = false;
        if (show && courseFilterLogs && d.course !== courseFilterLogs) show = false;
        if (show && yearFilterLogs && d.year !== yearFilterLogs) show = false;
        if (show && acadYearFilter && d.ay !== acadYearFilter) show = false;
        if (show && verificationFilter && d.verified !== verificationFilter) show = false;
      } else {
        // Home table – column indices: 0:checkbox, 1:RFID, 2:STUDENT NO, 3:NAME, 4:COURSE, 5:YEAR LEVEL, 6:A.Y., 7:GENDER, 8:DATE
        const courseCell = row.cells[4];
        const yearCell = row.cells[5];
        const acadYearCell = row.cells[6];
        const genderCell = row.cells[7];

        if (courseFilterHome && courseCell && courseCell.textContent.trim() !== courseFilterHome) show = false;
        if (show && yearFilterHome && yearCell && yearCell.textContent.trim() !== yearFilterHome) show = false;
        if (show && acadYearFilterHome && acadYearCell && acadYearCell.textContent.trim() !== acadYearFilterHome) show = false;
        if (show && genderFilterHome && genderCell && genderCell.textContent.trim() !== genderFilterHome) show = false;
      }
    }

    if (show && (dateFrom || dateTo)) {
      const rowDate = row.dataset.date || '';
      if (!rowDate || (dateFrom && rowDate < dateFrom) || (dateTo && rowDate > dateTo)) show = false;
    }

    row.style.display = show ? '' : 'none';
  });

  if (isLogTable) updateLogStats(rows);
}

// Summary above the logs table: visible logs and how many forms were re-released (lost forms)
function updateLogStats(rows) {
  const stats = document.getElementById('logStats');
  if (!stats) return;
  let shown = 0;
  let formsReReleased = 0;
  let totalReReleases = 0;
  let verified = 0;
  let awaitingPhoto = 0;
  rows.forEach(row => {
    if (row.style.display === 'none') return;
    shown++;
    if (row.dataset.verified === 'yes') verified++;
    if (row.dataset.verified === 'no') awaitingPhoto++;
    const count = Number(row.dataset.rereleases);
    if (count > 0) formsReReleased++;
    totalReReleases += count;
  });
  stats.textContent = `Showing ${shown} log(s) · Verified: ${verified} · Returned, no photo: ${awaitingPhoto} · Re-released forms: ${formsReReleased} · Total re-releases: ${totalReReleases}`;
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
  const verificationFilter = document.getElementById('verificationFilter');
  if (verificationFilter) verificationFilter.value = '';

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
  document.getElementById('rfidSearch').focus();   // ready for the next scan
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
    const promises = ids.flatMap(id => {
      const deletes = [deleteDoc(doc(db, 'clearanceLogs', id))];
      if (clearanceLogs.find(log => log.id === id)?.verified) deletes.push(deleteDoc(doc(db, 'clearancePhotos', id)));
      return deletes;
    });
    await Promise.all(promises);
    loadClearanceLogs();
    showMessageModal('Selected logs deleted.');
  } catch (err) {
    showMessageModal('Delete failed: ' + friendlyError(err));
  } finally {
    pendingDeleteLogIds = [];
  }
}

// ==================== MODALS ====================
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
    tfoot { display: table-footer-group; }
    tfoot td { border: none; padding-top: 6px; font-size: 8pt; color: #555; text-align: center; }
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
    <tfoot><tr><td colspan="${headers.length}">${escapeHtml(EXPORT_CREDIT)}</td></tr></tfoot>
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
let isLoggingIn = false;

async function login() {
  if (isLoggingIn) return;
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  clearErrorsIn(document.querySelector('.login-container'));
  if (!email) showFieldError('username');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) showFieldError('username', 'Enter a valid email address, for example name@example.com.');
  if (!password) showFieldError('password');
  if (document.querySelector('.login-container [aria-invalid="true"]')) {
    focusFirstError();
    return;
  }

  isLoggingIn = true;
  const loginButton = document.getElementById('loginButton');
  loginButton.disabled = true;
  loginButton.textContent = 'Logging in...';
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2FA: email must be verified
    if (!user.emailVerified) {
      showFormAlert('loginAlert', 'Your email is not verified yet. Open the verification link we sent you, then log in again. If you cannot find it, check your spam or junk folder.');
      await signOut(auth);
      return;
    }

    // Fetch user role and approval status from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      showFormAlert('loginAlert', 'We could not find your account record. Create an account again, or ask the ITC for help.');
      await signOut(auth);
      return;
    }

    const userData = userDoc.data();
    const role = userData.role || 'user';
    const approved = userData.approved;

    // For regular users, check approval
    if (role === 'user' && approved !== true) {
      showFormAlert('loginAlert', 'Your account is waiting for approval. You can log in once an administrator approves it.');
      await signOut(auth);
      return;
    }

    // Redirect based on role
    window.location.href = ROLE_HOME[role] || 'home.html';
  } catch (err) {
    if (err.code === 'auth/invalid-credential') {
      showFieldError('password', 'The email or password is incorrect. Check both and try again, or use "Forgot password?".');
    } else if (err.code === 'auth/too-many-requests') {
      showFormAlert('loginAlert', 'Too many failed attempts. Wait a few minutes, or reset your password with "Forgot password?".');
    } else {
      console.error('Login error:', err);
      showFormAlert('loginAlert', 'Login failed. ' + friendlyError(err));
    }
  } finally {
    isLoggingIn = false;
    loginButton.disabled = false;
    loginButton.textContent = 'Log in';
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
    showMessageModal('Logout failed: ' + friendlyError(err));
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
    el.classList.remove('match-ok', 'match-bad');
  });
  clearErrorsIn(document.getElementById('registerModal'));
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

  clearErrorsIn(document.getElementById('registerModal'));

  const value = id => document.getElementById(id).value;
  const schoolId = value('regSchoolId').trim().toUpperCase();
  const firstName = capitalizeNameWords(value('regFirstName'));
  const lastName = capitalizeNameWords(value('regLastName'));
  const email = value('regEmail').trim().toLowerCase();
  const password = value('regPassword');
  const confirm = value('regConfirmPassword');

  // Every field is required; each message says what to enter
  const required = {
    regSchoolId: schoolId, regFirstName: firstName, regLastName: lastName,
    regEmail: email, regPassword: password, regConfirmPassword: confirm
  };
  Object.entries(required).forEach(([id, v]) => { if (!v) showFieldError(id); });

  if (schoolId && !/^[A-Z0-9-]{4,20}$/.test(schoolId)) {
    showFieldError('regSchoolId', 'School ID needs 4 to 20 letters, numbers or dashes, for example 2024-0001.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('regEmail', 'Enter a valid email address, for example name@example.com.');
  }
  if (password && password.length < 8) {
    showFieldError('regPassword', 'Use at least 8 characters.');
  }
  if (password && confirm && password !== confirm) {
    showFieldError('regConfirmPassword', 'The passwords do not match. Type the same password in both fields.');
  }
  if (document.querySelector('#registerModal [aria-invalid="true"]')) {
    focusFirstError();
    return;
  }

  isRegistering = true;
  const registerButton = document.getElementById('registerButton');
  registerButton.disabled = true;
  registerButton.textContent = 'Creating account...';
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
      showFieldError('regEmail', 'This email is already registered. Log in instead, or use a different email.');
    } else if (err.code === 'auth/weak-password') {
      showFieldError('regPassword', 'This password is too easy to guess. Use at least 8 characters, mixing letters and numbers.');
    } else if (err.code === 'auth/invalid-email') {
      showFieldError('regEmail', 'Enter a valid email address, for example name@example.com.');
    } else {
      console.error('Registration error:', err);
      showFormAlert('registerAlert', 'Registration failed. ' + friendlyError(err));
    }
    focusFirstError();
  } finally {
    isRegistering = false;
    registerButton.disabled = false;
    registerButton.textContent = 'Create account';
  }
}

// ==================== PASSWORD RESET ====================
function showForgotPasswordModal() {
  clearErrorsIn(document.getElementById('forgotPasswordModal'));
  document.getElementById('resetEmail').value = '';
  document.getElementById('forgotPasswordModal').style.display = 'flex';
}
function closeForgotPasswordModal() {
  document.getElementById('forgotPasswordModal').style.display = 'none';
}
async function sendPasswordReset() {
  const email = document.getElementById('resetEmail').value.trim();
  clearFieldError('resetEmail');
  if (!email) {
    showFieldError('resetEmail');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('resetEmail', 'Enter a valid email address, for example name@example.com.');
    return;
  }
  const resetButton = document.getElementById('resetButton');
  resetButton.disabled = true;
  resetButton.textContent = 'Sending...';
  try {
    await sendPasswordResetEmail(auth, email);
    closeForgotPasswordModal();
    showMessageModal('If an account exists for ' + email + ', a reset link is on its way.\nCheck your inbox, and also your spam or junk folder.');
  } catch (err) {
    if (err.code === 'auth/invalid-email') {
      showFieldError('resetEmail', 'Enter a valid email address, for example name@example.com.');
    } else if (err.code === 'auth/user-not-found') {
      showFieldError('resetEmail', 'No account uses this email. Check the spelling, or create an account.');
    } else if (err.code === 'auth/too-many-requests') {
      showFieldError('resetEmail', 'Too many requests. Wait a few minutes and try again.');
    } else {
      showFieldError('resetEmail', 'Could not send the reset link. ' + friendlyError(err));
    }
  } finally {
    resetButton.disabled = false;
    resetButton.textContent = 'Send reset link';
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

// ==================== TOP BAR: ACCOUNT MENU + SETTINGS ====================
const ICON_SETTINGS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5" fill="var(--color-bg-2)"/><circle cx="15" cy="17" r="2.5" fill="var(--color-bg-2)"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance', needsAccount: false },
  { id: 'account',    label: 'Account',    needsAccount: true },
  { id: 'about',      label: 'About',      needsAccount: false }
];

let currentProfile = null;
let activeSettingsTab = 'appearance';

// The login page has no signed-in user, so it only gets the settings button.
function buildTopBar() {
  const right = document.querySelector('.topbar-right');
  const isAppPage = !!document.querySelector('.main-wrapper');
  right.innerHTML =
    (isAppPage
      ? '<div class="account">' +
          '<button id="accountButton" class="account-btn" aria-haspopup="menu" aria-expanded="false">' +
            '<span id="accountName" class="account-name"></span>' + ICON_CHEVRON +
          '</button>' +
          '<div id="accountMenu" class="account-menu" role="menu" hidden>' +
            '<div id="accountRole" class="account-menu-role"></div>' +
            '<button role="menuitem" class="account-menu-item" onclick="closeAccountMenu(); logout()">Log out</button>' +
          '</div>' +
        '</div>'
      : '') +
    '<button id="settingsButton" class="icon-btn" aria-label="Settings" title="Settings">' + ICON_SETTINGS + '</button>';

  document.getElementById('settingsButton').addEventListener('click', () => showSettings('appearance'));
  const accountButton = document.getElementById('accountButton');
  if (accountButton) accountButton.addEventListener('click', toggleAccountMenu);
}

function showAccountInTopBar(profile) {
  currentProfile = profile;
  document.getElementById('accountName').textContent = profile.lastName;
  document.getElementById('accountRole').textContent = ROLE_LABELS[profile.role];
}

function toggleAccountMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('accountMenu');
  const open = menu.hidden;
  menu.hidden = !open;
  document.getElementById('accountButton').setAttribute('aria-expanded', String(open));
}

function closeAccountMenu() {
  const menu = document.getElementById('accountMenu');
  if (!menu) return;
  menu.hidden = true;
  document.getElementById('accountButton').setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', closeAccountMenu);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeAccountMenu();
  closeSettings();
});

// ---- Settings dialog
function showSettings(tab) {
  let modal = document.getElementById('settingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'modal';
    modal.addEventListener('click', e => { if (e.target === modal) closeSettings(); });
    modal.innerHTML =
      '<div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">' +
        '<div class="settings-head"><h3 id="settingsTitle">Settings</h3>' +
          '<button class="settings-close" aria-label="Close" onclick="closeSettings()">&times;</button></div>' +
        '<div class="settings-body"><nav id="settingsNav" class="settings-nav"></nav><div id="settingsPanel" class="settings-panel"></div></div>' +
        '<button class="settings-done" onclick="closeSettings()">Done</button>' +
      '</div>';
    document.body.appendChild(modal);
  }
  activeSettingsTab = tab;
  renderSettingsPanel();
  modal.style.display = 'flex';
}

function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
}

function selectSettingsTab(tab) {
  activeSettingsTab = tab;
  renderSettingsPanel();
}

function renderSettingsPanel() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;

  const tabs = SETTINGS_TABS.filter(t => !t.needsAccount || currentProfile);
  document.getElementById('settingsNav').innerHTML = tabs.map(t =>
    `<button class="settings-tab${t.id === activeSettingsTab ? ' active' : ''}" onclick="selectSettingsTab('${t.id}')">${t.label}</button>`
  ).join('');

  const panel = document.getElementById('settingsPanel');
  if (activeSettingsTab === 'appearance') {
    const theme = getTheme();
    const dark = document.body.classList.contains('dark-mode');
    panel.innerHTML =
      '<h4 class="settings-heading">Theme <span>(this device)</span></h4>' +
      '<div class="theme-options">' +
        THEMES.map(t => `<button class="theme-option${t.id === theme ? ' active' : ''}" onclick="setTheme('${t.id}')">${t.label}</button>`).join('') +
      '</div>' +
      (theme === 'system' ? `<p class="settings-hint">Follows your device: currently ${dark ? 'dark' : 'light'}.</p>` : '') +
      '<h4 class="settings-heading">Text size <span>(this device)</span></h4>' +
      '<div class="theme-options text-size-options">' +
        TEXT_SIZES.map(t => `<button class="theme-option${t.id === getTextSize() ? ' active' : ''}" onclick="setTextSize('${t.id}')">${t.label}</button>`).join('') +
      '</div>' +
      '<h4 class="settings-heading">Display <span>(this device)</span></h4>' +
      [
        ['boldText', 'Bold text', 'Makes all text heavier and easier to read.'],
        ['highContrast', 'High contrast', 'Stronger text, borders and buttons.']
      ].map(([key, label, hint]) => {
        const on = localStorage.getItem(key) === 'on';
        return `<div class="switch-row"><div><div class="switch-label">${label}</div><div class="switch-hint">${hint}</div></div>` +
          `<button type="button" role="switch" aria-checked="${on}" aria-label="${label}" class="switch${on ? ' on' : ''}" onclick="toggleAppearanceOption('${key}')"></button></div>`;
      }).join('');
  } else if (activeSettingsTab === 'account') {
    const p = currentProfile;
    const rows = [
      ['Name', `${p.firstName} ${p.lastName}`],
      ['School ID', p.schoolId],
      ['Email', p.email],
      ['Role', ROLE_LABELS[p.role]]
    ];
    panel.innerHTML = '<h4 class="settings-heading">Account</h4><dl class="settings-list">' +
      rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('') + '</dl>';
  } else {
    panel.innerHTML =
      '<h4 class="settings-heading">About</h4>' +
      '<div class="about-head">' +
        '<img src="Resources/mcslogo.png" alt="Marian Computer Society logo" class="about-logo">' +
        '<div><p class="settings-about-name">Clearance Monitoring</p>' +
        '<p class="about-by">Marian Computer Society<br>St. Mary\'s College of Meycauayan, Inc.</p></div>' +
      '</div>' +
      '<p class="about-desc">Clearance Monitoring keeps track of student clearance forms from release to return and verification. ' +
      'Staff can manage student records and programs, update clearance statuses, and confirm returned forms with a photo, all in one place.</p>' +
      '<p class="settings-hint">Need help? Please contact the system developer for assistance.</p>' +
      '<h4 class="settings-heading">Credits</h4><div id="creditsBody" class="credits-body">Loading...</div>';
    loadCredits();
  }
}

async function loadCredits() {
  const body = document.getElementById('creditsBody');
  const response = await fetch('credits.txt', { cache: 'no-cache' });
  if (!response.ok) throw new Error('credits.txt: HTTP ' + response.status);
  renderCredits(body, await response.text());
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

let pendingImportRecords = [];   // [{ type: 'create' | 'update', record, docId?, changes? }]

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

// Re-read the chosen file when the "update year level / A.Y." option is switched
function reprocessImportFile() {
  const input = document.getElementById('importFile');
  if (input && input.files && input.files[0]) handleImportFile(input);
}

async function downloadImportTemplate() {
  await loadXlsx();
  const wb = XLSX.utils.book_new();

  const students = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(c => c.label)]);
  students['!cols'] = IMPORT_COLUMNS.map(c => ({ wch: Math.max(c.label.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, students, 'Students');

  const year = Number(toPhDateString(new Date()).slice(0, 4));
  const help = XLSX.utils.aoa_to_sheet([
    ['Column', 'What to enter'],
    ['RFID No.', 'Digits only (1 to 10). Format this column as Text in Excel so leading zeros are kept. This is the number on the CURRENT ID card.'],
    ['Student No.', 'One letter followed by 6 digits, e.g. C123456. This never changes, so it identifies the student.'],
    ['Surname / First Name', 'Letters, spaces, apostrophes and hyphens. Capitalization is fixed automatically.'],
    ['Middle Name', 'Optional. Every other column is required.'],
    ['Program', 'One of: ' + (programs.map(p => p.programCode).concat('Others').join(', '))],
    ['Year Level', '1st, 2nd, 3rd, 4th or Irregular (1, 2, 3, 4 also work)'],
    ['Academic Year', `e.g. ${year}-${year + 1} (second year must be the first year + 1)`],
    ['Gender', 'Male, Female or Other'],
    [],
    ['Student No. not in the system yet', 'A new student is registered.'],
    ['Student No. already in the system', 'The student is NOT replaced. Only the RFID No. is updated to the one in the file (the old card number is remembered). Name, program, year level and A.Y. are kept unless you tick the option in the import window.'],
    ['RFID No. used by another student', 'The row is skipped and reported.'],
    ['Exported file', 'The Excel/CSV exported from the Students page uses these same columns and can be imported again.']
  ]);
  help['!cols'] = [{ wch: 34 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, help, 'Instructions');

  XLSX.writeFile(wb, 'student_import_template.xlsx');
}

// Every student already in Firestore (fresh read, not the cached table), indexed for the import check
async function fetchExistingStudentKeys() {
  const snapshot = await getDocs(collection(db, 'students'));
  const byNumber = new Map();   // studentNumber -> { id, ...data }
  const byRfid = new Map();     // rfidNumber -> { id, ...data }
  snapshot.docs.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (data.studentNumber) byNumber.set(data.studentNumber, data);
    if (data.rfidNumber) byRfid.set(data.rfidNumber, data);
  });
  return { byNumber, byRfid };
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
  } else if (!/^\d{1,10}$/.test(rfidNumber)) {
    errors.push('RFID No. must be 1 to 10 digits');
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

// The student number decides who the student is. For a student who is already in the system
// only the RFID number changes (plus year level / A.Y. when that option is ticked).
function planExistingStudentUpdate(existing, record, alsoUpdateYear) {
  const changes = {};
  if (existing.rfidNumber !== record.rfidNumber) {
    changes.rfidNumber = record.rfidNumber;
    changes.previousRfids = buildPreviousRfids(existing, record.rfidNumber);
  }
  if (alsoUpdateYear) {
    if (existing.yearLevel !== record.yearLevel) changes.yearLevel = record.yearLevel;
    if (existing.academicYear !== record.academicYear) changes.academicYear = record.academicYear;
  }
  return changes;
}

async function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;

  const summary = document.getElementById('importSummary');
  const confirmBtn = document.getElementById('importConfirmBtn');
  const alsoUpdateYear = !!document.getElementById('importUpdateYear')?.checked;
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

    await loadXlsx();
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
    const issues = [];
    const candidates = [];   // valid rows, before the RFID conflict check

    for (let r = 1; r < matrix.length; r++) {
      const cells = matrix[r];
      if (cells.every(c => String(c).trim() === '')) continue;                 // blank row
      if (String(cells[0] ?? '').trim().startsWith('This is system-generated')) continue;   // credit line of an exported file

      const raw = {};
      Object.entries(columnIndex).forEach(([key, i]) => { raw[key] = cells[i]; });
      const sheetRow = r + 1;
      const { record, errors } = validateImportRow(raw, resolveProgram);

      if (!errors.length) {
        if (seenNumber.has(record.studentNumber)) errors.push(`Student No. is repeated in this file (row ${seenNumber.get(record.studentNumber)})`);
        else if (seenRfid.has(record.rfidNumber)) errors.push(`RFID No. is repeated in this file (row ${seenRfid.get(record.rfidNumber)})`);
      }

      if (errors.length) {
        issues.push({ row: sheetRow, messages: errors });
      } else {
        seenNumber.set(record.studentNumber, sheetRow);
        seenRfid.set(record.rfidNumber, sheetRow);
        candidates.push({ record, sheetRow });
      }
    }

    // Students whose card number is being replaced by this file free up their old RFID
    const rfidBeingReplaced = new Set();
    candidates.forEach(({ record }) => {
      const ex = existing.byNumber.get(record.studentNumber);
      if (ex && ex.rfidNumber && ex.rfidNumber !== record.rfidNumber) rfidBeingReplaced.add(ex.rfidNumber);
    });

    const records = [];
    let unchanged = 0;
    let detailsKept = 0;

    candidates.forEach(({ record, sheetRow }) => {
      const sameNumber = existing.byNumber.get(record.studentNumber);
      const rfidOwner = existing.byRfid.get(record.rfidNumber);

      // The RFID belongs to a different student who is not getting a new card in this file
      if (rfidOwner && (!sameNumber || rfidOwner.id !== sameNumber.id) && !rfidBeingReplaced.has(record.rfidNumber)) {
        issues.push({ row: sheetRow, messages: [`RFID No. is already assigned to ${rfidOwner.studentNumber} (${formatFullName(rfidOwner)})`] });
        return;
      }

      if (!sameNumber) {
        records.push({ type: 'create', record, sheetRow });
        return;
      }

      const changes = planExistingStudentUpdate(sameNumber, record, alsoUpdateYear);
      if (Object.keys(changes).length === 0) {
        unchanged++;
        return;
      }
      // Name, program and gender in the file are never used for a student who already exists
      const differs = ['surname', 'firstName', 'middleName', 'program', 'gender']
        .some(k => String(sameNumber[k] ?? '') !== String(record[k] ?? ''));
      if (differs) detailsKept++;
      records.push({ type: 'update', record, docId: sameNumber.id, changes, sheetRow, oldRfid: sameNumber.rfidNumber || '' });
    });

    pendingImportRecords = records;
    renderImportSummary(records, issues, unchanged, detailsKept);
    confirmBtn.disabled = records.length === 0;
    confirmBtn.textContent = records.length ? `Import ${records.length} student${records.length === 1 ? '' : 's'}` : 'Import';
  } catch (err) {
    console.error('Import read error:', err);
    summary.textContent = err.message;
    summary.classList.add('import-error');
  }
}

function renderImportSummary(records, issues, unchanged, detailsKept) {
  const summary = document.getElementById('importSummary');
  summary.classList.remove('import-error');
  summary.innerHTML = '';

  const created = records.filter(r => r.type === 'create').length;
  const updated = records.filter(r => r.type === 'update');
  const rfidUpdates = updated.filter(r => 'rfidNumber' in r.changes).length;

  const lines = [
    `${created} new student(s) will be registered.`,
    `${updated.length} existing student(s) will be updated (${rfidUpdates} new RFID number${rfidUpdates === 1 ? '' : 's'}).`
  ];
  if (unchanged) lines.push(`${unchanged} student(s) are already up to date.`);
  if (detailsKept) lines.push(`${detailsKept} existing student(s) have different name/program/gender details in the file; their saved details are kept.`);
  lines.push(`${issues.length} row(s) will be skipped.`);
  lines.forEach(text => {
    const line = document.createElement('p');
    line.textContent = text;
    summary.appendChild(line);
  });

  if (issues.length) {
    const list = document.createElement('ul');
    list.className = 'import-issues';
    issues.sort((a, b) => a.row - b.row).slice(0, 50).forEach(issue => {
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

    // Re-check against Firestore right before writing; someone may have changed students meanwhile
    const existing = await fetchExistingStudentKeys();
    const replacing = new Set(
      pendingImportRecords.filter(r => r.type === 'update' && 'rfidNumber' in r.changes && r.oldRfid).map(r => r.oldRfid)
    );
    const toWrite = [];
    let skipped = 0;
    pendingImportRecords.forEach(item => {
      const { record } = item;
      const sameNumber = existing.byNumber.get(record.studentNumber);
      const rfidOwner = existing.byRfid.get(record.rfidNumber);
      const rfidTaken = rfidOwner && (!sameNumber || rfidOwner.id !== sameNumber.id) && !replacing.has(record.rfidNumber);
      if (rfidTaken || (item.type === 'create' && sameNumber) || (item.type === 'update' && !sameNumber)) {
        skipped++;
      } else {
        toWrite.push(item);
      }
    });
    total = toWrite.length;
    const dateTime = getPhilippinesDateTimeString();

    for (let i = 0; i < toWrite.length; i += IMPORT_BATCH_SIZE) {
      const chunk = toWrite.slice(i, i + IMPORT_BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(item => {
        if (item.type === 'create') {
          // Student number is the document ID, so a student can never be created twice
          batch.set(doc(db, 'students', item.record.studentNumber), { ...item.record, dateTime });
        } else {
          batch.update(doc(db, 'students', item.docId), item.changes);
        }
      });
      await batch.commit();
      written += chunk.length;
      confirmBtn.textContent = `Importing ${written}/${total}...`;
    }

    const newCount = toWrite.filter(i => i.type === 'create').length;
    const updCount = toWrite.length - newCount;
    closeImportModal();
    await loadStudents();
    showMessageModal(`Registered ${newCount} new student(s), updated ${updCount} existing student(s).` + (skipped ? `\n${skipped} skipped because the data changed in the meantime.` : ''));
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

// ==================== EXPORT STUDENTS IN THE IMPORT FORMAT ====================
// Rows follow whatever filters are applied on the page. Students without a student number
// (old students registered without an ID card) cannot be imported, so they are left out.
async function exportStudentsForImport(type, table) {
  const visibleIds = new Set();
  Array.from(table.tBodies[0].rows).forEach(row => {
    if (row.style.display === 'none') return;
    const id = row.querySelector('.home-checkbox')?.getAttribute('data-doc-id');
    if (id) visibleIds.add(id);
  });

  const list = allStudents.filter(st => visibleIds.has(st.id));
  const exportable = list.filter(st => st.studentNumber && st.rfidNumber);
  const left = list.length - exportable.length;
  exportable.sort((a, b) => formatFullName(a).localeCompare(formatFullName(b)));

  const rows = [IMPORT_COLUMNS.map(c => c.label)];
  exportable.forEach(st => {
    rows.push(IMPORT_COLUMNS.map(c => String(st[c.key] ?? '')));
  });

  let blob, filename;
  if (type === 'excel') {
    await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Text cells keep leading zeros in the RFID number
    for (let r = 1; r < rows.length; r++) {
      ['A', 'B'].forEach(col => {
        const cell = ws[col + (r + 1)];
        if (cell) { cell.t = 's'; cell.z = '@'; }
      });
    }
    ws['!cols'] = IMPORT_COLUMNS.map((c, i) => ({
      wch: Math.max(c.label.length, ...rows.slice(1).map(r => r[i].length)) + 3
    }));
    XLSX.utils.sheet_add_aoa(ws, [[EXPORT_CREDIT]], { origin: { r: rows.length + 1, c: 0 } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    filename = 'students.xlsx';
  } else {
    const csvRows = rows.concat([[], [EXPORT_CREDIT]]);
    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    filename = 'students.csv';
  }

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
  if (left > 0) {
    showMessageModal(`${left} student(s) without a student number or RFID were left out because they cannot be imported.`);
  }
}

// ==================== EXPORT ====================
// The on-screen log table packs two values into one cell, so exports are built from the log data
// instead: one column per value, only the rows that pass the current filters.
const LOG_EXPORT_COLUMNS = [
  ['ID Number',        log => log.studentNumber],
  ['Name',             log => log.name],
  ['Release Date',     log => formatLogDate(log.claimedDate).replace('\n', ' ')],
  ['Receive Date',     log => formatLogDate(log.returnedDate).replace('\n', ' ')],
  ['A.Y.',             log => log.academicYear],
  ['Semester',         log => log.semester],
  ['Year Level',       log => log.yearLevel],
  ['Course',           log => log.program],
  ['Remarks',          log => logRemarksText(log)],
  ['Comment',          log => log.comment],
  ['Status',           log => log.status],
  ['Re-releases',      log => String(log.reReleaseCount || 0)],
  ['Re-release Date',  log => formatLogDate(log.lastReReleasedDate).replace('\n', ' ')]
];

function buildLogExportTable(table) {
  const visibleIds = new Set([...table.tBodies[0].rows]
    .filter(row => row.style.display !== 'none')
    .map(row => row.querySelector('.log-checkbox').dataset.logId));
  const exportTable = document.createElement('table');
  exportTable.innerHTML = '<thead><tr>' + LOG_EXPORT_COLUMNS.map(([label]) => `<th>${label}</th>`).join('') + '</tr></thead><tbody></tbody>';
  const body = exportTable.tBodies[0];
  sortLogs(clearanceLogs, logSort.column, logSort.direction)
    .filter(log => visibleIds.has(log.id))
    .forEach(log => {
      const tr = body.insertRow();
      LOG_EXPORT_COLUMNS.forEach(([, getValue]) => { tr.insertCell().textContent = getValue(log) ?? ''; });
    });
  return exportTable;
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

  // Students list: Excel and CSV use the same columns as the import file, so they can be imported again
  if (isHome && (type === 'excel' || type === 'csv')) {
    await exportStudentsForImport(type, table);
    return;
  }

  const clone = isLogTable ? buildLogExportTable(table) : table.cloneNode(true);
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  for (let i = clonedTBody.rows.length - 1; i >= 0 && !isLogTable; i--) {   // log export is already filtered
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }

  if (isHome) {
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
    await loadXlsx();
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

    XLSX.utils.sheet_add_aoa(ws, [[EXPORT_CREDIT]], { origin: { r: rows.length + 1, c: 0 } });

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

    rows.push([]);
    rows.push([EXPORT_CREDIT]);

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
