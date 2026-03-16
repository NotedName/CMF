// ==================== Export Functions ====================
import { showModal, closeModal, showPrintDialog } from './ui.js';

export function showExportModal() {
  showModal('exportModal');
}

export function closeExportModal() {
  closeModal('exportModal');
}

export function exportChosen(type) {
  closeExportModal();
  exportData(type);
}

function exportData(type) {
  const isLogTable = window.location.pathname.includes('clearanceTracking.html');
  const isHome = window.location.pathname.includes('home.html');
  let table = null;
  if (isLogTable) table = document.getElementById('clearanceLogTable');
  else if (isHome) table = document.getElementById('homeTable');
  else return;
  if (!table) return;
  const clone = table.cloneNode(true);
  const originalRows = table.tBodies[0].rows;
  const clonedTBody = clone.tBodies[0];
  for (let i = clonedTBody.rows.length - 1; i >= 0; i--) {
    if (originalRows[i] && originalRows[i].style.display === 'none') {
      clonedTBody.deleteRow(i);
    }
  }
  // Remove checkbox and RFID columns for export
  if (isLogTable) {
    const headerRow = clone.querySelector('thead tr');
    if (headerRow && headerRow.cells.length > 0) {
      headerRow.deleteCell(0); // checkbox
      if (headerRow.cells.length > 0) headerRow.deleteCell(0); // RFID
    }
    clone.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length > 0) {
        row.deleteCell(0);
        if (row.cells.length > 0) row.deleteCell(0);
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
        row.deleteCell(0);
        if (row.cells.length > 0) row.deleteCell(0);
      }
    });
  }
  if (type === 'excel') {
    exportToExcel(clone, isLogTable);
  } else if (type === 'pdf') {
    exportToPDF(clone, isLogTable);
  } else if (type === 'csv') {
    exportToCSV(clone, isLogTable);
  }
}

function exportToExcel(clone, isLogTable) {
  const wb = XLSX.utils.book_new();
  const rows = [];
  const headerRow = [];
  const thead = clone.querySelector('thead tr');
  if (thead) {
    thead.querySelectorAll('th').forEach(th => headerRow.push(th.innerText.trim()));
    rows.push(headerRow);
  }
  clone.querySelectorAll('tbody tr').forEach(tr => {
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
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, isLogTable ? 'clearance_logs.xlsx' : 'students.xlsx');
}

function exportToPDF(clone, isLogTable) {
  const headers = [];
  const thead = clone.querySelector('thead tr');
  if (thead) {
    thead.querySelectorAll('th').forEach(th => headers.push(th.innerText.trim()));
  }
  if (isLogTable && headers.length > 4) {
    headers[4] = "A.Y.";
  }
  const bodyRows = [];
  clone.querySelectorAll('tbody tr').forEach(tr => {
    const row = [];
    tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
    bodyRows.push(row);
  });
  const title = isLogTable ? 'Clearance Logs' : 'Student List';
  showPrintDialog(headers, bodyRows, title);
}

function exportToCSV(clone, isLogTable) {
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
  const csvContent = rows.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n');
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