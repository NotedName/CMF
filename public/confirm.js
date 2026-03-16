// ==================== Global Confirm Handler ====================
import { pendingDeleteRfids, pendingAdminDelete, confirmDelete, confirmAdminDelete } from './students.js';
import { pendingDeleteLogIds, confirmDeleteLogs } from './clearance.js';
import { pendingDeleteProgramId, confirmProgramDelete } from './programs.js';
import { pendingUserAction, confirmUserAction } from './users.js';
import { closeModal } from './ui.js';

window.confirmModalAction = function() {
  if (pendingDeleteRfids.length > 0) {
    confirmDelete();
  } else if (pendingDeleteLogIds.length > 0) {
    confirmDeleteLogs();
  } else if (pendingAdminDelete.length > 0) {
    confirmAdminDelete();
  } else if (pendingDeleteProgramId) {
    confirmProgramDelete();
  } else if (pendingUserAction) {
    confirmUserAction();
  } else {
    closeModal('confirmModal');
  }
};