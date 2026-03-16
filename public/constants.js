// ==================== Constants ====================
export const COLLECTIONS = {
  STUDENTS: 'students',
  CLEARANCE_LOGS: 'clearanceLogs',
  PROGRAMS: 'programs',
  USERS: 'users'
};

export const MODALS = {
  CONFIRM: 'confirmModal',
  HELP: 'helpModal',
  LOGOUT: 'logoutModal',
  MESSAGE: 'messageModal',
  EXPORT: 'exportModal',
  ADD_PROGRAM: 'addProgramModal',
  EDIT_PROGRAM: 'editProgramModal',
  SUCCESS: 'successModal',
  UPDATE_CONFIRM: 'updateConfirmModal',
  UPDATE_SUCCESS: 'updateSuccessModal',
  ERROR: 'errorModal',
  REGISTER: 'registerModal',
  FORGOT_PASSWORD: 'forgotPasswordModal'
};

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin'
};

export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
};

export const DEFAULT_SORT = {
  HOME: { column: 3, direction: SORT_DIRECTIONS.ASC },      // Name
  LOGS: { column: 2, direction: SORT_DIRECTIONS.ASC },      // Student Name
  ADMIN: { column: 1, direction: SORT_DIRECTIONS.ASC },     // Name
  PROGRAM: { column: 0, direction: SORT_DIRECTIONS.ASC },   // Program Code
  USER: { column: 0, direction: SORT_DIRECTIONS.ASC }       // Email
};

export const PAGE_SIZE = 50; // for pagination
export const PROGRAM_CACHE_KEY = 'cached_programs';
export const PROGRAM_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export const ERROR_MESSAGES = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-not-found': 'No account found with this email.',
  'permission-denied': 'You do not have permission to perform this action.',
  'already-exists': 'This record already exists.',
  default: 'An error occurred. Please try again.'
};