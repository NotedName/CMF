// ==================== GLOBAL VARIABLES ====================
let allStudents = [];
let clearanceLogs = [];
let pendingDeleteRfids = [];
let homeSort = { column: 2, direction: 'asc' };        // default sort by NAME column
let logSort = { column: 2, direction: 'asc' };         // default sort by NAME column (clearance log)
let isEditMode = false;                                 // track if we are in update mode
let currentStudentForUpdate = null;                     // for status update page

// ==================== PAGE INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  loadStudents();
  loadClearanceLogs();
  attachSortListeners();
  if (document.getElementById('date')) setDefaultDate();
  if (window.location.pathname.includes('registrationPage.html')) enableHoverScroll();
  if (window.location.pathname.includes('statusupdate.html')) enableStatusUpdateHoverScroll();

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
      if (onclick.includes('goRegistered()') && path === 'clearanceTracking.html') link.classList.add('active');
    });
  }
  setActiveNav();

  if (window.location.pathname.includes('registrationPage.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const rfid = urlParams.get('rfid');
    if (rfid) {
      setupEditMode(rfid);
    }

    // ---------- Tampering detection ----------
    let tamperInterval = setInterval(checkFieldIntegrity, 2000);

    function checkFieldIntegrity() {
      // Fields that must have data-field matching their id
      const fieldsToCheck = [
        'surname', 'firstName', 'middleName',
        'program', 'yearLevel', 'gender'
      ];

      for (let id of fieldsToCheck) {
        const el = document.getElementById(id);
        if (!el) continue; // element missing? might be okay if not loaded
        const dataField = el.getAttribute('data-field');
        // If data-field is missing or doesn't match the id, tampering detected
        if (!dataField || dataField !== id) {
          triggerTamperAlert();
          return;
        }
      }

      // Optional: check that the register button's onclick hasn't been replaced
      const regBtn = document.getElementById('registerButton');
      if (regBtn && regBtn.getAttribute('onclick') !== 'validateAndRegister()' &&
                     regBtn.getAttribute('onclick') !== 'validateAndUpdate()') {
        triggerTamperAlert();
      }
    }

    function triggerTamperAlert() {
      clearInterval(tamperInterval);
      showMessageModal('I know what you did there blud...');
      // Optionally disable all inputs and buttons
      document.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }

    // Clear interval when leaving the page
    window.addEventListener('beforeunload', function() {
      clearInterval(tamperInterval);
    });
    // ---------- END tampering detection ----------
  }
});

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
  try {
    const q = query(collection(db, 'students'), orderBy('dateTime', 'desc'));
    const querySnapshot = await getDocs(q);
    allStudents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (document.getElementById('homeTable')) {
      renderHomeTable(allStudents, true);
      updateSortIndicators(homeSort.column, homeSort.direction, false);
      populateCourseFilter();
    }
  } catch (err) {
    console.error('Failed to load students:', err);
  }
}

async function loadClearanceLogs() {
  try {
    const q = query(collection(db, 'clearanceLogs'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    clearanceLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // populate semester and remarks filters after loading
    populateSemesterAndRemarksFilters();
    if (document.getElementById('clearanceLogTable')) {
      renderClearanceLogs(clearanceLogs, true);
      updateSortIndicators(logSort.column, logSort.direction, true);
    }
    applyFilters();
  } catch (err) {
    console.error('Failed to load clearance logs:', err);
  }
}

// Helper to format full name from parts (full middle name)
function formatFullName(student) {
  const surname = student.surname || '';
  const firstName = student.firstName || '';
  const middle = student.middleName ? ' ' + student.middleName : '';
  return surname ? `${surname}, ${firstName}${middle}` : (firstName + middle).trim();
}

// ==================== RENDERING HOME TABLE ====================
function renderHomeTable(students, keepSort = false) {
  const tbody = document.querySelector('#homeTable tbody');
  if (!tbody) return;
  let data = keepSort ? sortStudents(students, homeSort.column, homeSort.direction) : students;
  tbody.innerHTML = data.map(student => {
    const fullName = formatFullName(student);
    return `
      <tr>
        <td style="width: 30px; text-align: center;">
          <input type="checkbox" class="home-checkbox" data-rfid="${student.rfidNumber}" onchange="updateSelectAllHomeState()">
        </td>
        <td>${student.rfidNumber || ''}</td>
        <td>${fullName}</td>
        <td>${student.program || ''}</td>
        <td>${student.yearLevel || ''}</td>
        <td>${student.studentNumber || ''}</td>
        <td>${student.dateTime || ''}</td>
        <td>${student.gender || ''}</td>
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
    return `
      <tr>
        <td>${log.rfid || ''}</td>
        <td>${idNumber}</td>
        <td>${name}</td>
        <td>${releaseDate}</td>
        <td>${receiveDate}</td>
        <td>${academicYear}</td>
        <td>${semester}</td>
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
    const map = {
      0: 'rfid', 1: 'studentNumber', 2: 'name', 3: 'claimedDate', 4: 'returnedDate',
      5: 'academicYear', 6: 'semester', 7: 'remarks', 8: 'status'
    };
    return map[columnIndex];
  } else {
    const map = {
      1: 'rfidNumber', 2: 'name', 3: 'program', 4: 'yearLevel', 5: 'studentNumber',
      6: 'dateTime', 7: 'gender'
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
      // Build full name for comparison: "Surname, FirstName MiddleName"
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
  setTimeout(() => {
    const isLogTable = window.location.pathname.includes('clearanceTracking.html');
    const sort = isLogTable ? logSort : homeSort;
    updateSortIndicators(sort.column, sort.direction, isLogTable);
  }, 100);
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
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => handleSort(index));
    });
  }
}

// ==================== HARD DELETE SELECTED (HOME) ====================
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
  } catch (err) {
    showMessageModal('Delete failed: ' + err.message);
  }
}

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
      // Not found, enable registration mode
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

    // Use ID for RFID (always disabled)
    document.getElementById('rfidNumber').value = student.rfidNumber || '';
    // Use data-field for editable name fields
    document.querySelector('[data-field="surname"]').value = student.surname || '';
    document.querySelector('[data-field="firstName"]').value = student.firstName || '';
    document.querySelector('[data-field="middleName"]').value = student.middleName || '';
    // Use data-field for dropdowns
    document.querySelector('[data-field="program"]').value = student.program || '';
    document.querySelector('[data-field="yearLevel"]').value = student.yearLevel || '';
    // Student number and date use ID (locked)
    document.getElementById('studentNumber').value = student.studentNumber || '';
    if (student.dateTime) {
      const datePart = student.dateTime.split(' ')[0];
      document.getElementById('date').value = datePart;
    }
    document.querySelector('[data-field="gender"]').value = student.gender || '';

    // Disable only RFID, Student Number, and Date (immutable)
    document.getElementById('rfidNumber').disabled = true;
    document.getElementById('studentNumber').disabled = true;
    document.getElementById('date').disabled = true;

    // All other fields are editable (surname, firstName, middleName, program, yearLevel, gender)
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
function validateAndUpdate() {
  clearAllFieldErrors();

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
function validateAndRegister() {
  clearAllFieldErrors();

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

// Clear form function
function clearRegistrationForm() {
  if (!isEditMode) {
    resetRegistrationForm();
  } else {
    showMessageModal('Cannot clear while in edit mode.');
  }
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

// ==================== STATUS UPDATE PAGE ====================
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
      currentStudentForUpdate = student;
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
  const currentRemarks = student.remarks || 'None';
  const currentAcadYear = student.academicYear || '';
  const currentSemester = student.semester || '';
  const fullName = formatFullName(student);

  // Generate academic year options with default = current year
  let acadOptions = '<option value="" disabled>Select Academic Year</option>';
  const currentYear = new Date().getFullYear();
  const defaultAcad = `${currentYear}-${currentYear + 1}`;
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const acad = `${year}-${year + 1}`;
    const selected = (currentAcadYear ? (acad === currentAcadYear) : (acad === defaultAcad)) ? 'selected' : '';
    acadOptions += `<option value="${acad}" ${selected}>${acad}</option>`;
  }

  // Semester options with default = 1st
  const defaultSemester = '1st';
  const semesterOptions = `
    <option value="" disabled>Select Semester</option>
    <option value="1st" ${(currentSemester || defaultSemester) === '1st' ? 'selected' : ''}>1st Semester</option>
    <option value="2nd" ${(currentSemester || defaultSemester) === '2nd' ? 'selected' : ''}>2nd Semester</option>
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
            <option value="None" ${currentRemarks === 'None' ? 'selected' : ''}>None</option>
            <option value="Graduating" ${currentRemarks === 'Graduating' ? 'selected' : ''}>Graduating</option>
            <option value="Moving Up" ${currentRemarks === 'Moving Up' ? 'selected' : ''}>Moving Up</option>
            <option value="Transferring" ${currentRemarks === 'Transferring' ? 'selected' : ''}>Transferring</option>
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

  // Attach hover scroll to the newly created dropdowns
  attachStatusUpdateHoverScroll();
}

// Helper function to add wheel scroll to status update dropdowns
function attachStatusUpdateHoverScroll() {
  const selects = document.querySelectorAll('#updateRemarks, #updateAcadYear, #updateSemester');
  selects.forEach(select => {
    // Remove any existing listener to avoid duplicates (optional)
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

// ==================== RELEASE STUDENT (Claimed) ====================
async function releaseStudent(rfid) {
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newAcadYear = document.getElementById('updateAcadYear').value;
    const newSemester = document.getElementById('updateSemester').value;

    // Validate that required fields are selected
    if (!newAcadYear || !newSemester) {
      showMessageModal('Please select Academic Year and/or Semester to proceed.');
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
    searchStudent();
    loadClearanceLogs();
  } catch (err) {
    console.error('Release error:', err);
    showMessageModal('Release failed: ' + err.message);
  }
}

// ==================== RECEIVE STUDENT (Returned) ====================
async function receiveStudent(rfid) {
  try {
    const newRemarks = document.getElementById('updateRemarks').value;
    const newAcadYear = document.getElementById('updateAcadYear').value;
    const newSemester = document.getElementById('updateSemester').value;

    // Validate that required fields are selected
    if (!newAcadYear || !newSemester) {
      showMessageModal('Please select Academic Year and/or Semester to proceed.');
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
    searchStudent();
    loadClearanceLogs();
  } catch (err) {
    console.error('Receive error:', err);
    showMessageModal('Receive failed: ' + err.message);
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
  passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
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

// NEW: Populate semester and remarks dropdowns with unique values from logs
function populateSemesterAndRemarksFilters() {
  const semesterSet = new Set();
  const remarksSet = new Set();
  clearanceLogs.forEach(log => {
    if (log.semester) semesterSet.add(log.semester);
    if (log.remarks) remarksSet.add(log.remarks);
  });

  const semesterFilter = document.getElementById('semesterFilter');
  const remarksFilter = document.getElementById('remarksFilter');
  if (semesterFilter) {
    semesterFilter.innerHTML = '<option value="">All</option>' +
      [...semesterSet].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  }
  if (remarksFilter) {
    remarksFilter.innerHTML = '<option value="">All</option>' +
      [...remarksSet].sort().map(r => `<option value="${r}">${r}</option>`).join('');
  }
}

// ==================== FILTERING ====================
function applyFilters() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const tableId = isLogTable ? '#clearanceLogTable' : '#homeTable';
  const table = document.querySelector(tableId);
  if (!table) return;

  const searchInput = document.getElementById('search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  const courseFilter = document.getElementById('courseFilter')?.value || '';
  const yearFilter = document.getElementById('yearFilter')?.value || '';
  // NEW: get semester and remarks filter values
  const semesterFilter = document.getElementById('semesterFilter')?.value || '';
  const remarksFilter = document.getElementById('remarksFilter')?.value || '';

  const rows = document.querySelectorAll(`${tableId} tbody tr`);

  rows.forEach(row => {
    let show = true;

    if (searchInput && !row.innerText.toLowerCase().includes(searchInput)) {
      show = false;
    }

    if (show) {
      if (isLogTable) {
        const statusCell = row.cells[8];
        if (statusFilter && statusCell && statusCell.innerText.trim() !== statusFilter) {
          show = false;
        }
        // NEW: semester filter (column 6)
        if (show && semesterFilter) {
          const semesterCell = row.cells[6];
          if (semesterCell && semesterCell.innerText.trim() !== semesterFilter) show = false;
        }
        // NEW: remarks filter (column 7)
        if (show && remarksFilter) {
          const remarksCell = row.cells[7];
          if (remarksCell && remarksCell.innerText.trim() !== remarksFilter) show = false;
        }
      } else {
        const courseCell = row.cells[3];
        const yearCell = row.cells[4];
        if (courseFilter && courseCell && courseCell.innerText.trim() !== courseFilter) {
          show = false;
        }
        if (yearFilter && yearCell && yearCell.innerText.trim() !== yearFilter) {
          show = false;
        }
      }
    }

    row.style.display = show ? '' : 'none';
    let searchTimeout;
    document.getElementById('search').addEventListener('keyup', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 500);
    });
  });
}

function clearFilters() {
  document.getElementById('search').value = '';
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.value = '';
  const semesterFilter = document.getElementById('semesterFilter');
  if (semesterFilter) semesterFilter.value = '';
  const remarksFilter = document.getElementById('remarksFilter');
  if (remarksFilter) remarksFilter.value = '';
  const courseFilter = document.getElementById('courseFilter');
  if (courseFilter) courseFilter.value = '';
  const yearFilter = document.getElementById('yearFilter');
  if (yearFilter) yearFilter.value = '';
  applyFilters();
}

// ==================== REFRESH TABLE ====================
function refreshTable() {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  if (isLogTable) {
    loadClearanceLogs();
  } else {
    loadStudents();
  }
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

// ==================== EXPORT ====================
function exportData(type) {
  if (!type) return;

  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const isHome = window.location.pathname.includes('home.html');
  const isRegistration = window.location.pathname.includes('registrationPage.html');

  let table = null;
  if (isLogTable) {
    table = document.getElementById('clearanceLogTable');
  } else if (isHome) {
    table = document.getElementById('homeTable');
  } else if (isRegistration) {
    // No table, fallback to allStudents
    if (allStudents.length === 0) {
      showMessageModal('No data to export.');
      return;
    }
    // Build export from allStudents array
    const header = ['RFID NO.', 'NAME', 'COURSE', 'YEAR LEVEL', 'STUDENT NO.', 'DATE & TIME', 'GENDER'];
    const dataRows = allStudents.map(s => [
      s.rfidNumber || '',
      formatFullName(s),
      s.program || '',
      s.yearLevel || '',
      s.studentNumber || '',
      s.dateTime || '',
      s.gender || ''
    ]);

    if (type === 'excel') {
      const wb = XLSX.utils.book_new();
      const rows = [header, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) continue;
          ws[cellRef].s = { alignment: { horizontal: 'center', vertical: 'center' } };
        }
      }
      const colWidths = header.map((h, i) => {
        let maxLen = h.length;
        dataRows.forEach(r => {
          if (r[i] && r[i].length > maxLen) maxLen = r[i].length;
        });
        return { wch: maxLen + 2 };
      });
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      XLSX.writeFile(wb, 'students.xlsx');
    } else if (type === 'pdf') {
      // For PDF, we can create a simple printable table
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
          <head><title>Students Export</title>
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: center; }
            th { background-color: #f0f0f0; }
          </style>
          </head>
          <body>
          <table>
            <thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>
              ${dataRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      } else {
        showMessageModal('Popup blocked. Please allow popups for PDF export.');
      }
    }
    return;
  } else {
    // Unknown page
    return;
  }

  if (!table) return;

  // Original export logic for tables (home/clearance)
  const clone = table.cloneNode(true);
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  for (let i = clonedTBody.rows.length - 1; i >= 0; i--) {
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }

  // Remove unwanted columns from the clone
  if (isLogTable) {
    // Remove RFID column (first column)
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) headerRow.deleteCell(0);
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) row.deleteCell(0);
    });
  } else if (isHome) {
    // Remove checkbox column (first) and RFID column (now first after removal)
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) {
      headerRow.deleteCell(0); // checkbox
      if (headerRow.cells.length > 0) headerRow.deleteCell(0); // RFID
    }
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0); // checkbox
        if (row.cells.length > 0) row.deleteCell(0); // RFID
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
      const cells = tr.querySelectorAll('td');
      cells.forEach(td => row.push(td.innerText.trim()));
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
    window.print();
  }
}