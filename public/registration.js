// ==================== Registration Page ====================
import { checkRFID, registerStudent, updateStudent, isStudentNumberDuplicate } from './students.js';
import { showMessageModal, showModal, showFieldError, clearAllFieldErrors, enableHoverScroll, setDefaultDate } from './ui.js'; // setDefaultDate is in utils, but we import from ui now? Actually setDefaultDate is in utils, so need to import from utils.
import { setDefaultDate } from './utils.js'; // correct
import { populateProgramDropdown } from './programs.js';

export function initRegistrationPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const rfid = urlParams.get('rfid');
  if (rfid) {
    setupEditMode(rfid);
  } else {
    resetRegistrationForm();
  }
  enableHoverScroll('.registration-layout select');
  populateProgramDropdown();
  setDefaultDate();
}

export async function setupEditMode(rfid) {
  try {
    const student = await checkRFID(rfid);
    if (!student) {
      showMessageModal('Student not found.');
      return;
    }
    document.getElementById('rfidNumber').value = student.rfidNumber || '';
    document.getElementById('surname').value = student.surname || '';
    document.getElementById('firstName').value = student.firstName || '';
    document.getElementById('middleName').value = student.middleName || '';
    document.getElementById('program').value = student.program || '';
    document.getElementById('yearLevel').value = student.yearLevel || '';
    document.getElementById('studentNumber').value = student.studentNumber || '';
    if (student.dateTime) {
      document.getElementById('date').value = student.dateTime.split(' ')[0];
    }
    document.getElementById('gender').value = student.gender || '';
    document.getElementById('rfidNumber').disabled = true;
    document.getElementById('studentNumber').disabled = true;
    document.getElementById('date').disabled = true;
    document.getElementById('surname').disabled = false;
    document.getElementById('firstName').disabled = false;
    document.getElementById('middleName').disabled = false;
    document.getElementById('program').disabled = false;
    document.getElementById('yearLevel').disabled = false;
    document.getElementById('gender').disabled = false;
    const btn = document.getElementById('registerButton');
    btn.textContent = 'UPDATE';
    btn.onclick = validateAndUpdate;
    window.isEditMode = true;
  } catch (err) {
    showMessageModal('Error loading student data.');
  }
}

export function resetRegistrationForm() {
  document.getElementById('rfidNumber').value = '';
  document.getElementById('surname').value = '';
  document.getElementById('firstName').value = '';
  document.getElementById('middleName').value = '';
  document.getElementById('studentNumber').value = '';
  document.getElementById('date').value = '';
  document.getElementById('program').selectedIndex = 0;
  document.getElementById('yearLevel').selectedIndex = 0;
  document.getElementById('gender').selectedIndex = 0;
  document.getElementById('rfidNumber').disabled = false;
  document.getElementById('surname').disabled = false;
  document.getElementById('firstName').disabled = false;
  document.getElementById('middleName').disabled = false;
  document.getElementById('studentNumber').disabled = false;
  document.getElementById('date').disabled = false;
  const btn = document.getElementById('registerButton');
  btn.textContent = 'REGISTER';
  btn.onclick = validateAndRegister;
  window.isEditMode = false;
  clearAllFieldErrors();
  setDefaultDate();
}

export function refreshRegistrationForm() {
  resetRegistrationForm();
}

export function clearRegistrationForm() {
  if (window.isEditMode) {
    document.getElementById('surname').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('middleName').value = '';
    document.getElementById('program').selectedIndex = 0;
    document.getElementById('gender').selectedIndex = 0;
    clearAllFieldErrors();
  } else {
    resetRegistrationForm();
  }
}

function getFormData() {
  return {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    surname: document.getElementById('surname').value.trim(),
    firstName: document.getElementById('firstName').value.trim(),
    middleName: document.getElementById('middleName').value.trim(),
    program: document.getElementById('program').value,
    yearLevel: document.getElementById('yearLevel').value,
    studentNumber: document.getElementById('studentNumber').value.trim(),
    date: document.getElementById('date').value.trim(),
    gender: document.getElementById('gender').value
  };
}

function validateFormData(data) {
  let hasError = false;
  if (!data.rfidNumber) { showFieldError('rfidNumber'); hasError = true; }
  if (!data.surname) { showFieldError('surname'); hasError = true; }
  if (!data.firstName) { showFieldError('firstName'); hasError = true; }
  if (!data.program) { showFieldError('program'); hasError = true; }
  if (!data.yearLevel) { showFieldError('yearLevel'); hasError = true; }
  if (!data.studentNumber) { showFieldError('studentNumber'); hasError = true; }
  if (!data.date) { showFieldError('date'); hasError = true; }
  if (!data.gender) { showFieldError('gender'); hasError = true; }
  if (hasError) {
    showMessageModal('Please fill in all required fields.');
    return false;
  }
  return true;
}

function isValidStudentNumber(sn) {
  return /^[A-Z]\d{6}$/.test(sn);
}

export function validateAndRegister() {
  const formData = getFormData();
  if (!validateFormData(formData)) return;
  isStudentNumberDuplicate(formData.studentNumber).then(isDuplicate => {
    if (isDuplicate) {
      showFieldError('studentNumber');
      showMessageModal('Student number already exists.');
      return;
    }
    if (!isValidStudentNumber(formData.studentNumber)) {
      showFieldError('studentNumber');
      showMessageModal('Student number must start with a letter followed by exactly 6 digits.');
      return;
    }
    registerStudent(formData);
  });
}

export function validateAndUpdate() {
  const formData = getFormData();
  if (!validateFormData(formData)) return;
  isStudentNumberDuplicate(formData.studentNumber, formData.rfidNumber).then(isDuplicate => {
    if (isDuplicate) {
      showFieldError('studentNumber');
      showMessageModal('Student number already exists.');
      return;
    }
    if (!isValidStudentNumber(formData.studentNumber)) {
      showFieldError('studentNumber');
      showMessageModal('Student number must start with a letter followed by exactly 6 digits.');
      return;
    }
    showModal('updateConfirmModal');
    window.pendingUpdateData = formData;
  });
}

export function formatStudentNumber(input) {
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

export function capitalizeNameWords(str) {
  if (!str) return '';
  str = str.trim().toLowerCase();
  return str.replace(/(^|[-\s'])([a-z])/g, (match, separator, letter) => separator + letter.toUpperCase());
}

export function formatAllNameFields() {
  const surname = document.getElementById('surname');
  const firstName = document.getElementById('firstName');
  const middleName = document.getElementById('middleName');
  if (surname) surname.value = capitalizeNameWords(surname.value);
  if (firstName) firstName.value = capitalizeNameWords(firstName.value);
  if (middleName) middleName.value = capitalizeNameWords(middleName.value);
}