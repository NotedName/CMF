// users.js
import { db } from './firebase.js';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { showMessageModal, showErrorModal, showTableSpinner, hideTableSpinner, showModal, closeModal } from './ui.js';
import { COLLECTIONS, DEFAULT_SORT } from './constants.js';
import { sortArray } from './utils.js';

let users = [];
let filteredUsers = [];
let userSort = { ...DEFAULT_SORT.USER };

export async function loadUsers() {
  const table = document.getElementById('usersTable');
  if (!table) return;
  showTableSpinner('#usersTable');
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.USERS));
    users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    filteredUsers = [...users];
    sortUsers();
    renderUsersTable();
  } catch (err) {
    showErrorModal(err.code, 'Failed to load users.');
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
        <td>${escapeHtml(user.email || '')}</td>
        <td>${escapeHtml(user.role || 'user')}</td>
        <td>${approved}</td>
        <td>${escapeHtml(createdAt)}</td>
        <td class="action-cell">
          ${!user.approved ? `<button onclick="showApproveConfirm('${user.uid}')" class="btn-approve">Approve</button>` : ''}
          <select id="role-${user.uid}" class="role-select">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
          </select>
          <button onclick="showUpdateRoleConfirm('${user.uid}')" class="btn-update">Update</button>
          <button onclick="showDeleteConfirm('${user.uid}')" class="btn-delete">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(unsafe) {
  if (!unsafe) return unsafe;
  return unsafe.replace(/[&<>"']/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#039;';
    return m;
  });
}

export function filterUsersTable() {
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
  sortUsers();
  renderUsersTable();
  updateUserSortIndicators();
}

export function clearUserFilters() {
  document.getElementById('userSearch').value = '';
  document.getElementById('roleFilter').value = '';
  document.getElementById('approvedFilter').value = '';
  filterUsersTable();
}

export function handleUserSort(columnIndex) {
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

// ---- Confirmation actions ----
let pendingUserAction = null;

export function showApproveConfirm(uid) {
  pendingUserAction = { uid, action: 'approve' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to approve this user?';
  showModal('confirmModal');
}

export function showDeleteConfirm(uid) {
  pendingUserAction = { uid, action: 'delete' };
  document.getElementById('confirmMessage').innerText = 'Are you sure you want to delete this user from Firestore?';
  showModal('confirmModal');
}

export function showUpdateRoleConfirm(uid) {
  const select = document.getElementById(`role-${uid}`);
  const newRole = select.value;
  pendingUserAction = { uid, action: 'updateRole', newRole };
  document.getElementById('confirmMessage').innerText = `Are you sure you want to change this user's role to ${newRole}?`;
  showModal('confirmModal');
}

export async function confirmUserAction() {
  if (!pendingUserAction) return;
  const { uid, action, newRole } = pendingUserAction;
  closeModal('confirmModal');
  try {
    if (action === 'approve') {
      await updateDoc(doc(db, COLLECTIONS.USERS, uid), { approved: true });
      showMessageModal('User approved.');
    } else if (action === 'delete') {
      await deleteDoc(doc(db, COLLECTIONS.USERS, uid));
      showMessageModal('User deleted.');
    } else if (action === 'updateRole') {
      await updateDoc(doc(db, COLLECTIONS.USERS, uid), { role: newRole });
      showMessageModal('Role updated.');
    }
    await loadUsers();
  } catch (err) {
    showErrorModal(err.code, 'Action failed.');
  } finally {
    pendingUserAction = null;
  }
}