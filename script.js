// TOGGLE PASSWORD 
function togglePassword() {
  const pass = document.getElementById("password");
  pass.type = pass.type === "password" ? "text" : "password";
}

// LOGIN FUNCTION 
function login() {
  const user = document.getElementById("username").value;
  const pass = document.getElementById("password").value;

  if (user === "" || pass === "") {
    alert("Please enter username and password");
    return;
  }

  window.location.href = "home.html";
}

// NAVIGATION FUNCTIONS
function needHelp() {
  alert("Please contact the system administrator for assistance.");
}

function goHome() {
  window.location.href = "home.html";
}

function goRegister() {
  window.location.href = "registrationPage.html";
}

function goRegistered() {
  window.location.href = "registeredPage.html";
}

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    window.location.href = "login.html";
  }
}

// EXPORT & SEARCH FUNCTIONS 
function exportData(type) {
  if (!type) return;

  const table = document.getElementById("registeredTable");

  if (type === "excel") {
    let tableHTML = table.outerHTML.replace(/ /g, "%20");

    const a = document.createElement("a");
    a.href = "data:application/vnd.ms-excel," + tableHTML;
    a.download = "registered_students.xls";
    a.click();
  }

  if (type === "pdf") {
    window.print();
  }

  document.getElementById("exportType").value = "";
}

function searchTable() {
  const input = document.getElementById("search").value.toLowerCase();
  const rows = document.querySelectorAll("#registeredTable tbody tr");

  rows.forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(input)
      ? ""
      : "none";
  });
}

// IMAGE UPLOAD FUNCTION 
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

// FORM VALIDATION WITH RED INPUT FIELDS

// FORM VALIDATION FUNCTION
function validateAndRegister() {
  // Clear previous field errors
  clearAllFieldErrors();
  
  // Get all input values
  const formData = {
    rfidNumber: document.getElementById('rfidNumber').value.trim(),
    name: document.getElementById('name').value.trim(),
    program: document.getElementById('program').value.trim(),
    yearLevel: document.getElementById('yearLevel').value.trim(),
    studentNumber: document.getElementById('studentNumber').value.trim(),
    date: document.getElementById('date').value.trim(),
    semester: document.getElementById('semester').value.trim(),
    academicYear: document.getElementById('academicYear').value.trim()
  };
  
  // Check if there are any empty fields
  let hasErrors = false;
  
  // Validate each field
  if (!formData.rfidNumber) {
    showFieldError('rfidNumber', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.name) {
    showFieldError('name', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.program) {
    showFieldError('program', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.yearLevel) {
    showFieldError('yearLevel', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.studentNumber) {
    showFieldError('studentNumber', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.date) {
    showFieldError('date', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.semester) {
    showFieldError('semester', 'This field is required');
    hasErrors = true;
  }
  
  if (!formData.academicYear) {
    showFieldError('academicYear', 'This field is required');
    hasErrors = true;
  }
  
  // If there are errors, stop and show error messages
  if (hasErrors) {
    return;
  }
  
  // If all fields are valid, proceed with registration
  registerStudent(formData);
}

// SHOW FIELD ERROR MESSAGE (RED BACKGROUND)
function showFieldError(fieldId, errorMessage) {
  const inputElement = document.getElementById(fieldId);
  inputElement.classList.add('error-field');
}

// CLEAR ALL FIELD ERRORS
function clearAllFieldErrors() {
  const allInputs = document.querySelectorAll('.registration-layout input');
  
  allInputs.forEach(input => {
    input.classList.remove('error-field');
  });
}

// CLEAR INDIVIDUAL FIELD ERROR
function clearFieldError(fieldId) {
  const inputElement = document.getElementById(fieldId);
  inputElement.classList.remove('error-field');
}

// REGISTER STUDENT FUNCTION
function registerStudent(formData) {
  // Get image data if available
  const profileImage = document.getElementById('profileImage');
  const imageUrl = profileImage.style.backgroundImage.slice(5, -2) || '';
  
  if (imageUrl) {
    formData.profileImage = imageUrl;
  }
  
  // Send data to backend
  fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      // Show success and redirect
      alert('✓ Registration successful!');
      window.location.href = 'home.html';
    } else {
      // Show error message
      showFieldError('rfidNumber', data.error || 'Registration failed. Please try again.');
    }
  })
  .catch(err => {
    showFieldError('rfidNumber', 'An error occurred. Please try again.');
    console.error('Error:', err);
  });
}