// ===== State Management =====
const state = {
  database: null,
  fields: [],
  records: [],
  currentView: 'upload',
  pivotConfig: {
    rowField: null,
    colField: null
  },
  pivotData: null,
  columnPreferences: {},
  currentFilter: null,
  filterGroups: [],
  nextFilterGroupId: 1,
  nextFilterConditionId: 1,
  pivotVisibility: {
    rows: new Set(),
    cols: new Set()
  },
  filteredRecordsCache: null
};

// ===== Service Worker Registration & Update Management =====
let newWorker;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration);

        // Check for updates every 60 seconds when online
        setInterval(() => {
          registration.update();
        }, 60000);

        // Handle updates
        registration.addEventListener('updatefound', () => {
          newWorker = registration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              showUpdateBanner();
            }
          });
        });
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });

    // Handle controller change (when new SW takes over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  banner.classList.remove('hidden');
}

function hideUpdateBanner() {
  const banner = document.getElementById('update-banner');
  banner.classList.add('hidden');
}

// ===== Online/Offline Status =====
function updateOnlineStatus() {
  const indicator = document.getElementById('status-indicator');
  if (navigator.onLine) {
    indicator.className = 'status-online';
    indicator.title = 'Online';
  } else {
    indicator.className = 'status-offline';
    indicator.title = 'Offline';
  }
}

// ===== XML Parsing (UTF-16 Support) =====
function parseXMLFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const xmlText = e.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
          reject(new Error('XML parsing error: ' + parserError.textContent));
          return;
        }

        resolve(xmlDoc);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('File reading error'));
    
    // Read as text with UTF-16 encoding
    reader.readAsText(file, 'UTF-16');
  });
}

function extractDataFromXML(xmlDoc) {
  const dataForms = xmlDoc.querySelectorAll('data_form');
  const records = [];
  const fieldSet = new Set();

  dataForms.forEach((form) => {
    const record = {};
    
    // Get all child elements (fields)
    Array.from(form.children).forEach((child) => {
      // Skip nested structures like qvp_acoustic_data_
      if (child.children.length === 0 || child.textContent.trim() !== '') {
        const fieldName = child.tagName;
        const fieldValue = child.textContent.trim();
        
        record[fieldName] = fieldValue;
        fieldSet.add(fieldName);
      }
    });
    
    if (Object.keys(record).length > 0) {
      records.push(record);
    }
  });

  const fields = Array.from(fieldSet).sort();
  
  return { records, fields };
}

// ===== Pivot Table Generation =====
function generatePivotTable(records, rowField, colField) {
  const pivotMap = new Map();
  const rowValues = new Set();
  const colValues = new Set();

  // Build pivot data structure
  records.forEach((record) => {
    const rowVal = record[rowField] || '(empty)';
    const colVal = record[colField] || '(empty)';
    
    rowValues.add(rowVal);
    colValues.add(colVal);
    
    const key = `${rowVal}|||${colVal}`;
    if (!pivotMap.has(key)) {
      pivotMap.set(key, []);
    }
    pivotMap.get(key).push(record);
  });

  // Sort values naturally
  const sortedRows = Array.from(rowValues).sort(naturalSort);
  const sortedCols = Array.from(colValues).sort(naturalSort);

  return {
    pivotMap,
    rowValues: sortedRows,
    colValues: sortedCols,
    rowField,
    colField
  };
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ===== Advanced Filtering =====
function createFilterGroup() {
  const group = {
    id: state.nextFilterGroupId++,
    logic: 'AND', // AND or OR
    conditions: []
  };
  state.filterGroups.push(group);
  return group;
}

function addFilterCondition(groupId) {
  const group = state.filterGroups.find(g => g.id === groupId);
  if (!group) return;
  
  const condition = {
    id: state.nextFilterConditionId++,
    field: state.fields[0] || '',
    operator: 'equals',
    value: '',
    useRegex: false
  };
  group.conditions.push(condition);
  return condition;
}

function removeFilterCondition(groupId, conditionId) {
  const group = state.filterGroups.find(g => g.id === groupId);
  if (!group) return;
  
  group.conditions = group.conditions.filter(c => c.id !== conditionId);
  renderFilterGroups();
}

function removeFilterGroup(groupId) {
  state.filterGroups = state.filterGroups.filter(g => g.id !== groupId);
  renderFilterGroups();
}

function clearAllFilters() {
  state.filterGroups = [];
  state.nextFilterGroupId = 1;
  state.nextFilterConditionId = 1;
  renderFilterGroups();
}

function applyFilters(records) {
  if (state.filterGroups.length === 0) {
    return records;
  }
  
  // Each filter group is evaluated independently, then combined with OR
  return records.filter(record => {
    // At least one filter group must match (OR between groups)
    return state.filterGroups.some(group => evaluateFilterGroup(record, group));
  });
}

function evaluateFilterGroup(record, group) {
  if (group.conditions.length === 0) {
    return true; // Empty group matches everything
  }
  
  // All conditions in a group must match if AND, or at least one if OR
  if (group.logic === 'AND') {
    return group.conditions.every(condition => evaluateCondition(record, condition));
  } else {
    return group.conditions.some(condition => evaluateCondition(record, condition));
  }
}

function evaluateCondition(record, condition) {
  const fieldValue = String(record[condition.field] || '');
  const testValue = String(condition.value);
  
  if (!testValue) {
    return true; // Empty condition matches everything
  }
  
  try {
    if (condition.useRegex) {
      const regex = new RegExp(testValue, 'i'); // Case insensitive
      switch (condition.operator) {
        case 'equals':
        case 'contains':
          return regex.test(fieldValue);
        case 'not-equals':
        case 'not-contains':
          return !regex.test(fieldValue);
        case 'starts-with':
          return new RegExp('^' + testValue, 'i').test(fieldValue);
        case 'ends-with':
          return new RegExp(testValue + '$', 'i').test(fieldValue);
        default:
          return true;
      }
    } else {
      const fieldLower = fieldValue.toLowerCase();
      const testLower = testValue.toLowerCase();
      
      switch (condition.operator) {
        case 'equals':
          return fieldLower === testLower;
        case 'not-equals':
          return fieldLower !== testLower;
        case 'contains':
          return fieldLower.includes(testLower);
        case 'not-contains':
          return !fieldLower.includes(testLower);
        case 'starts-with':
          return fieldLower.startsWith(testLower);
        case 'ends-with':
          return fieldLower.endsWith(testLower);
        case 'empty':
          return fieldValue === '';
        case 'not-empty':
          return fieldValue !== '';
        default:
          return true;
      }
    }
  } catch (error) {
    console.error('Filter evaluation error:', error);
    return false; // Invalid regex or other error
  }
}

function renderFilterGroups() {
  const container = document.getElementById('filter-groups-container');
  
  if (state.filterGroups.length === 0) {
    container.innerHTML = '<p class=\"no-filters\">No filters active. Click \"Add Filter Group\" to create filters.</p>';
    return;
  }
  
  let html = '';
  state.filterGroups.forEach((group, groupIndex) => {
    html += `
      <div class=\"filter-group\" data-group-id=\"${group.id}\">
        <div class=\"filter-group-header\">
          <span class=\"filter-group-title\">Filter Group ${groupIndex + 1}</span>
          <div class=\"filter-group-logic\">
            <label>Logic:</label>
            <select class=\"group-logic-select\" data-group-id=\"${group.id}\">
              <option value=\"AND\" ${group.logic === 'AND' ? 'selected' : ''}>AND (all must match)</option>
              <option value=\"OR\" ${group.logic === 'OR' ? 'selected' : ''}>OR (any must match)</option>
            </select>
          </div>
          <button class=\"remove-group-btn\" data-group-id=\"${group.id}\">Remove Group</button>
        </div>
        <div class=\"filter-conditions\">
    `;
    
    group.conditions.forEach((condition) => {
      html += `
        <div class=\"filter-condition\" data-condition-id=\"${condition.id}\">
          <div class=\"filter-field\">
            <label>Field</label>
            <select class=\"condition-field\" data-group-id=\"${group.id}\" data-condition-id=\"${condition.id}\">
              ${state.fields.map(field => 
                `<option value=\"${escapeHtml(field)}\" ${field === condition.field ? 'selected' : ''}>${escapeHtml(field)}</option>`
              ).join('')}
            </select>
          </div>
          <div class=\"filter-field\">
            <label>Operator</label>
            <select class=\"condition-operator\" data-group-id=\"${group.id}\" data-condition-id=\"${condition.id}\">
              <option value=\"equals\" ${condition.operator === 'equals' ? 'selected' : ''}>Equals</option>
              <option value=\"not-equals\" ${condition.operator === 'not-equals' ? 'selected' : ''}>Not Equals</option>
              <option value=\"contains\" ${condition.operator === 'contains' ? 'selected' : ''}>Contains</option>
              <option value=\"not-contains\" ${condition.operator === 'not-contains' ? 'selected' : ''}>Not Contains</option>
              <option value=\"starts-with\" ${condition.operator === 'starts-with' ? 'selected' : ''}>Starts With</option>
              <option value=\"ends-with\" ${condition.operator === 'ends-with' ? 'selected' : ''}>Ends With</option>
              <option value=\"empty\" ${condition.operator === 'empty' ? 'selected' : ''}>Is Empty</option>
              <option value=\"not-empty\" ${condition.operator === 'not-empty' ? 'selected' : ''}>Not Empty</option>
            </select>
          </div>
          <div class=\"filter-field\">
            <label>Value</label>
            <input type=\"text\" class=\"condition-value\" 
              data-group-id=\"${group.id}\" 
              data-condition-id=\"${condition.id}\"
              value=\"${escapeHtml(condition.value)}\"
              placeholder=\"Filter value\"
              ${condition.operator === 'empty' || condition.operator === 'not-empty' ? 'disabled' : ''}>
          </div>
          <div class=\"regex-toggle\">
            <input type=\"checkbox\" 
              class=\"condition-regex\" 
              id=\"regex-${condition.id}\"
              data-group-id=\"${group.id}\" 
              data-condition-id=\"${condition.id}\"
              ${condition.useRegex ? 'checked' : ''}>
            <label for=\"regex-${condition.id}\">Regex</label>
          </div>
          <button class=\"remove-condition-btn\" 
            data-group-id=\"${group.id}\" 
            data-condition-id=\"${condition.id}\">×</button>
        </div>
      `;
    });
    
    html += `
        </div>
        <button class=\"add-condition-btn\" data-group-id=\"${group.id}\">+ Add Condition</button>
      </div>
    `;
    
    if (groupIndex < state.filterGroups.length - 1) {
      html += '<div class=\"filter-group-separator\">OR</div>';
    }
  });
  
  container.innerHTML = html;
  attachFilterEventListeners();
}

function attachFilterEventListeners() {
  // Group logic changes
  document.querySelectorAll('.group-logic-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const groupId = parseInt(e.target.dataset.groupId);
      const group = state.filterGroups.find(g => g.id === groupId);
      if (group) {
        group.logic = e.target.value;
      }
    });
  });
  
  // Remove group buttons
  document.querySelectorAll('.remove-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const groupId = parseInt(e.target.dataset.groupId);
      removeFilterGroup(groupId);
    });
  });
  
  // Add condition buttons
  document.querySelectorAll('.add-condition-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const groupId = parseInt(e.target.dataset.groupId);
      addFilterCondition(groupId);
      renderFilterGroups();
    });
  });
  
  // Remove condition buttons
  document.querySelectorAll('.remove-condition-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const groupId = parseInt(e.target.dataset.groupId);
      const conditionId = parseInt(e.target.dataset.conditionId);
      removeFilterCondition(groupId, conditionId);
    });
  });
  
  // Condition field changes
  document.querySelectorAll('.condition-field').forEach(select => {
    select.addEventListener('change', (e) => {
      updateConditionField(e.target);
    });
  });
  
  // Condition operator changes
  document.querySelectorAll('.condition-operator').forEach(select => {
    select.addEventListener('change', (e) => {
      updateConditionField(e.target);
      
      // Enable/disable value input for empty/not-empty operators
      const groupId = parseInt(e.target.dataset.groupId);
      const conditionId = parseInt(e.target.dataset.conditionId);
      const valueInput = document.querySelector(`.condition-value[data-group-id=\"${groupId}\"][data-condition-id=\"${conditionId}\"]`);
      if (valueInput) {
        const operator = e.target.value;
        valueInput.disabled = (operator === 'empty' || operator === 'not-empty');
        if (valueInput.disabled) {
          valueInput.value = '';
        }
      }
    });
  });
  
  // Condition value changes
  document.querySelectorAll('.condition-value').forEach(input => {
    input.addEventListener('input', (e) => {
      updateConditionField(e.target);
    });
  });
  
  // Regex checkbox changes
  document.querySelectorAll('.condition-regex').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      updateConditionField(e.target);
    });
  });
}

function updateConditionField(element) {
  const groupId = parseInt(element.dataset.groupId);
  const conditionId = parseInt(element.dataset.conditionId);
  const group = state.filterGroups.find(g => g.id === groupId);
  if (!group) return;
  
  const condition = group.conditions.find(c => c.id === conditionId);
  if (!condition) return;
  
  if (element.classList.contains('condition-field')) {
    condition.field = element.value;
  } else if (element.classList.contains('condition-operator')) {
    condition.operator = element.value;
  } else if (element.classList.contains('condition-value')) {
    condition.value = element.value;
  } else if (element.classList.contains('condition-regex')) {
    condition.useRegex = element.checked;
  }
}

// ===== Pivot Table Visibility Controls =====
function initializePivotVisibility() {
  // Initialize visibility sets with all values visible
  if (state.pivotData) {
    state.pivotVisibility.rows = new Set(state.pivotData.rowValues);
    state.pivotVisibility.cols = new Set(state.pivotData.colValues);
  }
}

function renderPivotVisibilityControls() {
  if (!state.pivotData) return;
  
  const rowToggles = document.getElementById('row-visibility-toggles');
  const colToggles = document.getElementById('col-visibility-toggles');
  const hiddenRowsSelect = document.getElementById('hidden-rows-select');
  const hiddenColsSelect = document.getElementById('hidden-cols-select');
  
  // Get visible and hidden items
  const visibleRows = state.pivotData.rowValues.filter(v => state.pivotVisibility.rows.has(v));
  const hiddenRows = state.pivotData.rowValues.filter(v => !state.pivotVisibility.rows.has(v));
  const visibleCols = state.pivotData.colValues.filter(v => state.pivotVisibility.cols.has(v));
  const hiddenCols = state.pivotData.colValues.filter(v => !state.pivotVisibility.cols.has(v));
  
  // Render visible row toggles
  let rowHtml = '';
  visibleRows.forEach(rowVal => {
    rowHtml += `
      <div class="visibility-toggle-item">
        <input type="checkbox" id="row-vis-${escapeHtml(rowVal)}" 
          class="row-visibility-toggle" 
          data-value="${escapeHtml(rowVal)}" 
          checked>
        <label for="row-vis-${escapeHtml(rowVal)}">${escapeHtml(rowVal)}</label>
      </div>
    `;
  });
  rowToggles.innerHTML = rowHtml || '<p class="no-items">No visible rows</p>';
  
  // Render visible column toggles
  let colHtml = '';
  visibleCols.forEach(colVal => {
    colHtml += `
      <div class="visibility-toggle-item">
        <input type="checkbox" id="col-vis-${escapeHtml(colVal)}" 
          class="col-visibility-toggle" 
          data-value="${escapeHtml(colVal)}" 
          checked>
        <label for="col-vis-${escapeHtml(colVal)}">${escapeHtml(colVal)}</label>
      </div>
    `;
  });
  colToggles.innerHTML = colHtml || '<p class="no-items">No visible columns</p>';
  
  // Render hidden rows select
  let hiddenRowsHtml = '';
  hiddenRows.forEach(rowVal => {
    hiddenRowsHtml += `<option value="${escapeHtml(rowVal)}">${escapeHtml(rowVal)}</option>`;
  });
  hiddenRowsSelect.innerHTML = hiddenRowsHtml || '<option disabled>No hidden rows</option>';
  
  // Render hidden columns select
  let hiddenColsHtml = '';
  hiddenCols.forEach(colVal => {
    hiddenColsHtml += `<option value="${escapeHtml(colVal)}">${escapeHtml(colVal)}</option>`;
  });
  hiddenColsSelect.innerHTML = hiddenColsHtml || '<option disabled>No hidden columns</option>';
  
  // Attach event listeners
  attachPivotVisibilityListeners();
}

function attachPivotVisibilityListeners() {
  // Row visibility toggles
  document.querySelectorAll('.row-visibility-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const value = e.target.dataset.value;
      if (e.target.checked) {
        state.pivotVisibility.rows.add(value);
      } else {
        state.pivotVisibility.rows.delete(value);
      }
      updatePivotDisplay();
      renderPivotVisibilityControls();
    });
  });
  
  // Column visibility toggles
  document.querySelectorAll('.col-visibility-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const value = e.target.dataset.value;
      if (e.target.checked) {
        state.pivotVisibility.cols.add(value);
      } else {
        state.pivotVisibility.cols.delete(value);
      }
      updatePivotDisplay();
      renderPivotVisibilityControls();
    });
  });
}

function toggleAllRows(show) {
  if (show) {
    state.pivotData.rowValues.forEach(v => state.pivotVisibility.rows.add(v));
  } else {
    state.pivotVisibility.rows.clear();
  }
  updatePivotDisplay();
  renderPivotVisibilityControls();
}

function toggleAllCols(show) {
  if (show) {
    state.pivotData.colValues.forEach(v => state.pivotVisibility.cols.add(v));
  } else {
    state.pivotVisibility.cols.clear();
  }
  updatePivotDisplay();
  renderPivotVisibilityControls();
}

function addHiddenRows() {
  const select = document.getElementById('hidden-rows-select');
  const selectedOptions = Array.from(select.selectedOptions).map(opt => opt.value);
  selectedOptions.forEach(value => state.pivotVisibility.rows.add(value));
  updatePivotDisplay();
  renderPivotVisibilityControls();
}

function addHiddenCols() {
  const select = document.getElementById('hidden-cols-select');
  const selectedOptions = Array.from(select.selectedOptions).map(opt => opt.value);
  selectedOptions.forEach(value => state.pivotVisibility.cols.add(value));
  updatePivotDisplay();
  renderPivotVisibilityControls();
}

function updatePivotDisplay() {
  if (!state.pivotData || !state.filteredRecordsCache) return;
  
  const visibleRows = state.pivotData.rowValues.filter(v => state.pivotVisibility.rows.has(v));
  const visibleCols = state.pivotData.colValues.filter(v => state.pivotVisibility.cols.has(v));
  
  renderPivotTableWithVisibility(state.pivotData, visibleRows, visibleCols, 
    state.filteredRecordsCache.length, state.records.length);
}

function refreshPivotWithFilters() {
  // Reapply filters and regenerate pivot table
  const rowField = state.pivotConfig.rowField;
  const colField = state.pivotConfig.colField;
  
  if (!rowField || !colField) return;
  
  const filteredRecords = applyFilters(state.records);
  state.filteredRecordsCache = filteredRecords;
  
  state.pivotData = generatePivotTable(filteredRecords, rowField, colField);
  
  // Reset visibility to show all
  initializePivotVisibility();
  
  // Render the updated pivot table
  renderPivotTableWithVisibility(state.pivotData, state.pivotData.rowValues, 
    state.pivotData.colValues, filteredRecords.length, state.records.length);
}

// ===== Rendering Functions =====
function renderPivotTableWithVisibility(pivotData, visibleRows, visibleCols, filteredCount, totalCount) {
  const table = document.getElementById('pivot-table');
  const info = document.getElementById('pivot-info');
  
  const filterInfo = filteredCount < totalCount 
    ? ` (${filteredCount} after filtering from ${totalCount} total)` 
    : '';
  
  const visibilityInfo = (visibleRows.length < pivotData.rowValues.length || 
                          visibleCols.length < pivotData.colValues.length)
    ? ` | <strong>Showing:</strong> ${visibleRows.length}/${pivotData.rowValues.length} rows, ${visibleCols.length}/${pivotData.colValues.length} cols`
    : '';
  
  info.innerHTML = `
    <strong>Rows:</strong> ${pivotData.rowField} | 
    <strong>Columns:</strong> ${pivotData.colField} | 
    <strong>Records:</strong> ${filteredCount}${filterInfo}${visibilityInfo}
  `;

  // Build table HTML
  let html = '<thead><tr><th></th>';
  
  // Column headers (only visible ones)
  visibleCols.forEach((colVal) => {
    html += `<th>${escapeHtml(colVal)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Rows (only visible ones)
  visibleRows.forEach((rowVal) => {
    html += `<tr><th>${escapeHtml(rowVal)}</th>`;
    
    visibleCols.forEach((colVal) => {
      const key = `${rowVal}|||${colVal}`;
      const entries = pivotData.pivotMap.get(key) || [];
      const count = entries.length;
      
      if (count > 0) {
        html += `<td><button class="cell-btn" data-row="${escapeHtml(rowVal)}" data-col="${escapeHtml(colVal)}">${count} entries</button></td>`;
      } else {
        html += '<td class="empty-cell">—</td>';
      }
    });
    
    html += '</tr>';
  });
  
  html += '</tbody>';
  table.innerHTML = html;

  // Add click handlers
  table.querySelectorAll('.cell-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rowVal = e.target.dataset.row;
      const colVal = e.target.dataset.col;
      showDatasheet(rowVal, colVal);
    });
  });
}

function renderPivotTable(pivotData, filteredCount, totalCount) {
  // Initialize visibility and render with all rows/cols visible
  initializePivotVisibility();
  renderPivotTableWithVisibility(pivotData, pivotData.rowValues, pivotData.colValues, 
    filteredCount, totalCount);
}

function showDatasheet(rowVal, colVal) {
  const key = `${rowVal}|||${colVal}`;
  const filteredRecords = state.pivotData.pivotMap.get(key) || [];
  
  state.currentFilter = {
    rowVal,
    colVal,
    records: filteredRecords
  };

  renderDatasheet(filteredRecords);
  showSection('datasheet');
}

function renderDatasheet(records) {
  const info = document.getElementById('datasheet-info');
  const header = document.getElementById('datasheet-header');
  const body = document.getElementById('datasheet-body');
  
  info.innerHTML = `
    <strong>${state.pivotData.rowField}:</strong> ${escapeHtml(state.currentFilter.rowVal)} | 
    <strong>${state.pivotData.colField}:</strong> ${escapeHtml(state.currentFilter.colVal)} | 
    <strong>Records:</strong> ${records.length}
  `;

  // Get column preferences or initialize
  if (!state.columnPreferences[state.database]) {
    state.columnPreferences[state.database] = {
      visible: {},
      order: [...state.fields]
    };
    state.fields.forEach(field => {
      state.columnPreferences[state.database].visible[field] = true;
    });
    saveColumnPreferences();
  }

  const prefs = state.columnPreferences[state.database];
  const visibleFields = prefs.order.filter(f => prefs.visible[f]);

  // Render column toggles
  renderColumnToggles();

  // Render table header
  let headerHtml = '<tr>';
  visibleFields.forEach((field) => {
    headerHtml += `<th>
      <div class="header-cell">
        <span>${escapeHtml(field)}</span>
        <div class="header-controls">
          <button class="move-btn" data-field="${escapeHtml(field)}" data-dir="left" title="Move left">◀</button>
          <button class="move-btn" data-field="${escapeHtml(field)}" data-dir="right" title="Move right">▶</button>
        </div>
      </div>
    </th>`;
  });
  headerHtml += '</tr>';
  header.innerHTML = headerHtml;

  // Render table body
  let bodyHtml = '';
  records.forEach((record) => {
    bodyHtml += '<tr>';
    visibleFields.forEach((field) => {
      const value = record[field] || '';
      bodyHtml += `<td>${escapeHtml(value)}</td>`;
    });
    bodyHtml += '</tr>';
  });
  body.innerHTML = bodyHtml;

  // Add move button handlers
  header.querySelectorAll('.move-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = e.target.dataset.field;
      const dir = e.target.dataset.dir;
      moveColumn(field, dir);
    });
  });
}

function renderColumnToggles() {
  const container = document.getElementById('column-toggles');
  const prefs = state.columnPreferences[state.database];
  
  let html = '';
  state.fields.forEach((field) => {
    const checked = prefs.visible[field] ? 'checked' : '';
    html += `
      <label class="column-toggle">
        <input type="checkbox" data-field="${escapeHtml(field)}" ${checked}>
        <span>${escapeHtml(field)}</span>
      </label>
    `;
  });
  
  container.innerHTML = html;

  // Add toggle handlers
  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      toggleColumnVisibility(field);
    });
  });
}

function toggleColumnVisibility(field) {
  const prefs = state.columnPreferences[state.database];
  prefs.visible[field] = !prefs.visible[field];
  saveColumnPreferences();
  renderDatasheet(state.currentFilter.records);
}

function moveColumn(field, direction) {
  const prefs = state.columnPreferences[state.database];
  const currentIndex = prefs.order.indexOf(field);
  
  if (direction === 'left' && currentIndex > 0) {
    [prefs.order[currentIndex], prefs.order[currentIndex - 1]] = 
    [prefs.order[currentIndex - 1], prefs.order[currentIndex]];
  } else if (direction === 'right' && currentIndex < prefs.order.length - 1) {
    [prefs.order[currentIndex], prefs.order[currentIndex + 1]] = 
    [prefs.order[currentIndex + 1], prefs.order[currentIndex]];
  }
  
  saveColumnPreferences();
  renderDatasheet(state.currentFilter.records);
}

function saveColumnPreferences() {
  localStorage.setItem('columnPreferences', JSON.stringify(state.columnPreferences));
}

function loadColumnPreferences() {
  const saved = localStorage.getItem('columnPreferences');
  if (saved) {
    state.columnPreferences = JSON.parse(saved);
  }
}

// ===== UI Helper Functions =====
function showSection(sectionName) {
  const sections = ['upload', 'config', 'pivot', 'datasheet'];
  sections.forEach((section) => {
    const el = document.getElementById(`${section}-section`);
    if (section === sectionName) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  state.currentView = sectionName;
}

function populateFieldSelects() {
  const rowSelect = document.getElementById('row-field');
  const colSelect = document.getElementById('col-field');
  
  rowSelect.innerHTML = '<option value="">-- Select Field --</option>';
  colSelect.innerHTML = '<option value="">-- Select Field --</option>';
  
  state.fields.forEach((field) => {
    rowSelect.innerHTML += `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`;
    colSelect.innerHTML += `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Event Handlers =====
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    // Show loading state
    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = '<p>Loading database...</p>';
    fileInfo.classList.remove('hidden');

    // Parse XML
    const xmlDoc = await parseXMLFile(file);
    const { records, fields } = extractDataFromXML(xmlDoc);

    if (records.length === 0) {
      fileInfo.innerHTML = '<p class="error">No records found in database.</p>';
      return;
    }

    // Update state
    state.database = file.name;
    state.records = records;
    state.fields = fields;

    // Show file info
    fileInfo.innerHTML = `
      <p class="success">✓ Loaded: <strong>${escapeHtml(file.name)}</strong></p>
      <p>${records.length} records, ${fields.length} fields</p>
    `;
    document.getElementById('file-label-text').textContent = file.name;

    // Populate field selects
    populateFieldSelects();

    // Show config section
    showSection('config');
  } catch (error) {
    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = `<p class="error">Error loading database: ${escapeHtml(error.message)}</p>`;
    fileInfo.classList.remove('hidden');
    console.error('Error parsing XML:', error);
  }
}

function handleFieldChange() {
  const rowField = document.getElementById('row-field').value;
  const colField = document.getElementById('col-field').value;
  const generateBtn = document.getElementById('generate-btn');
  
  if (rowField && colField && rowField !== colField) {
    generateBtn.disabled = false;
  } else {
    generateBtn.disabled = true;
  }
}

function handleGeneratePivot() {
  const rowField = document.getElementById('row-field').value;
  const colField = document.getElementById('col-field').value;
  
  if (!rowField || !colField) return;

  state.pivotConfig.rowField = rowField;
  state.pivotConfig.colField = colField;
  
  // Apply filters before generating pivot table
  const filteredRecords = applyFilters(state.records);
  state.filteredRecordsCache = filteredRecords; // Cache for refresh
  
  state.pivotData = generatePivotTable(filteredRecords, rowField, colField);
  renderPivotTable(state.pivotData, filteredRecords.length, state.records.length);
  showSection('pivot');
}

// ===== Initialization =====
function init() {
  // Register service worker
  registerServiceWorker();

  // Load saved preferences
  loadColumnPreferences();

  // Set up online/offline indicators
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // File input
  document.getElementById('file-input').addEventListener('change', handleFileSelect);

  // Field selects
  document.getElementById('row-field').addEventListener('change', handleFieldChange);
  document.getElementById('col-field').addEventListener('change', handleFieldChange);

  // Generate button
  document.getElementById('generate-btn').addEventListener('click', handleGeneratePivot);

  // Filter buttons
  document.getElementById('add-filter-group-btn').addEventListener('click', () => {
    createFilterGroup();
    renderFilterGroups();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    if (confirm('Clear all filters?')) {
      clearAllFilters();
    }
  });

  document.getElementById('regex-help-btn').addEventListener('click', () => {
    document.getElementById('regex-modal').classList.remove('hidden');
  });

  document.getElementById('close-regex-modal').addEventListener('click', () => {
    document.getElementById('regex-modal').classList.add('hidden');
  });

  // Close modal when clicking outside
  document.getElementById('regex-modal').addEventListener('click', (e) => {
    if (e.target.id === 'regex-modal') {
      document.getElementById('regex-modal').classList.add('hidden');
    }
  });

  // Pivot visibility controls
  document.getElementById('toggle-pivot-visibility-btn').addEventListener('click', () => {
    const section = document.getElementById('pivot-visibility-section');
    section.classList.toggle('hidden');
    if (!section.classList.contains('hidden')) {
      renderPivotVisibilityControls();
    }
  });

  document.getElementById('refresh-pivot-btn').addEventListener('click', () => {
    refreshPivotWithFilters();
  });

  document.getElementById('show-all-rows').addEventListener('click', () => {
    toggleAllRows(true);
  });

  document.getElementById('hide-all-rows').addEventListener('click', () => {
    toggleAllRows(false);
  });

  document.getElementById('show-all-cols').addEventListener('click', () => {
    toggleAllCols(true);
  });

  document.getElementById('hide-all-cols').addEventListener('click', () => {
    toggleAllCols(false);
  });

  document.getElementById('add-hidden-rows-btn').addEventListener('click', () => {
    addHiddenRows();
  });

  document.getElementById('add-hidden-cols-btn').addEventListener('click', () => {
    addHiddenCols();
  });

  // Navigation buttons
  document.getElementById('back-to-config').addEventListener('click', () => {
    showSection('config');
  });

  document.getElementById('back-to-pivot').addEventListener('click', () => {
    showSection('pivot');
  });

  // Update button
  document.getElementById('update-btn').addEventListener('click', () => {
    if (newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    hideUpdateBanner();
  });

  console.log('Dekereke Pivot Tables initialized');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
