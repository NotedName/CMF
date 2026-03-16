// ==================== Authentication ====================
import { auth, db } from './firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { showModal, closeModal, showMessageModal, showErrorModal } from './ui.js';
import { ROLES, MODALS } from './constants.js';

let currentUserRole = null;

export async function getUserRole(user) {
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

export async function checkPageAccess(allowedRoles) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      const role = await getUserRole(user);
      if (!role || !allowedRoles.includes(role)) {
        // Redirect to default page for the actual role
        if (role === ROLES.USER) {
          window.location.href = 'registrationPage.html';
        } else if (role === ROLES.ADMIN) {
          window.location.href = 'home.html';
        } else if (role === ROLES.SUPERADMIN) {
          window.location.href = 'superadmin.html';
        } else {
          window.location.href = 'index.html';
        }
        return;
      }
      currentUserRole = role;
      document.body.classList.add(`role-${role}`);
      // We'll call updateSidebarForRole from the page-specific script
      resolve(role);
    });
  });
}

export function updateSidebarForRole(role) {
  const navItems = document.querySelectorAll('.sidebar .nav');
  if (!navItems.length) return;
  if (role === ROLES.USER) {
    navItems.forEach(item => {
      const onclick = item.getAttribute('onclick') || '';
      if (onclick.includes('goRegister()')) {
        item.classList.remove('hidden');
        item.style.display = 'flex';
      } else {
        item.classList.add('hidden');
        item.style.display = 'none';
      }
    });
  } else {
    navItems.forEach(item => {
      item.classList.remove('hidden');
      item.style.display = 'flex';
    });
  }
}

export async function login(email, password) {
  if (!email || !password) {
    showMessageModal('Please enter email and password');
    return false;
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    if (!user.emailVerified) {
      showMessageModal('Please verify your email before logging in.');
      await signOut(auth);
      return false;
    }
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      showMessageModal('User record not found. Please register again.');
      await signOut(auth);
      return false;
    }
    const userData = userDoc.data();
    const role = userData.role || ROLES.USER;
    const approved = userData.approved;
    if (role === ROLES.USER && approved !== true) {
      showMessageModal('Your account is pending approval.');
      await signOut(auth);
      return false;
    }
    // Redirect based on role
    window.location.href = role === ROLES.USER ? 'registrationPage.html' : 'home.html';
    return true;
  } catch (err) {
    showErrorModal(err.code);
    return false;
  }
}

export async function logout() {
  showModal(MODALS.LOGOUT);
}

export async function confirmLogout() {
  closeModal(MODALS.LOGOUT);
  try {
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (err) {
    showErrorModal(err.code);
  }
}

export async function register(email, password) {
  if (!email || !password) {
    showMessageModal('Please enter email and password.');
    return false;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email: email,
      role: ROLES.USER,
      approved: false,
      createdAt: new Date()
    });
    showMessageModal('Registration successful! Please verify your email.');
    closeModal(MODALS.REGISTER);
    return true;
  } catch (err) {
    showErrorModal(err.code);
    return false;
  }
}

export async function sendPasswordReset(email) {
  if (!email) {
    showMessageModal('Please enter your email.');
    return false;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessageModal('Password reset email sent.');
    closeModal(MODALS.FORGOT_PASSWORD);
    return true;
  } catch (err) {
    showErrorModal(err.code);
    return false;
  }
}

export async function updateTopBarForRole(user) {
  const helpText = document.getElementById('helpText');
  const helpIcon = document.querySelector('.help-icon');
  if (!user) {
    if (helpText) helpText.innerText = 'NEED HELP';
    if (helpIcon) helpIcon.innerHTML = '?';
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const role = userDoc.data().role;
      if (role === ROLES.SUPERADMIN) {
        if (helpText) helpText.innerText = 'SUPER ADMIN';
        if (helpIcon) helpIcon.innerHTML = 'A';
      } else if (role === ROLES.ADMIN) {
        if (helpText) helpText.innerText = 'ADMIN';
        if (helpIcon) helpIcon.innerHTML = '?';
      } else {
        if (helpText) helpText.innerText = 'USER';
        if (helpIcon) helpIcon.innerHTML = '?';
      }
    } else {
      if (helpText) helpText.innerText = 'NEED HELP';
      if (helpIcon) helpIcon.innerHTML = '?';
    }
  } catch (err) {
    console.error('Error updating top bar:', err);
  }
}

export function handleHelpClick() {
  const text = document.getElementById('helpText')?.innerText;
  if (text === 'SUPER ADMIN') {
    window.location.href = 'superadmin.html';
  } else {
    showModal(MODALS.HELP);
  }
}