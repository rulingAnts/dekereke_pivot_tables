// Copyright (C) 2025 Seth Johnston
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
  filteredRecordsCache: null,
  fieldValuesCache: {} // Cache unique values per field for multi-select
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
    values: [], // For multi-select
    useRegex: false,
    negate: false // NOT checkbox
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

function getFieldValues(fieldName) {
  // Cache field values for performance
  if (state.fieldValuesCache[fieldName]) {
    return state.fieldValuesCache[fieldName];
  }
  
  const valuesSet = new Set();
  state.records.forEach(record => {
    const value = record[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      valuesSet.add(String(value));
    }
  });
  
  const sortedValues = Array.from(valuesSet).sort(naturalSort);
  state.fieldValuesCache[fieldName] = sortedValues;
  return sortedValues;
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
  let result;
  
  // Handle multi-select operator (in-list)
  if (condition.operator === 'in-list') {
    if (!condition.values || condition.values.length === 0) {
      result = true; // Empty list matches everything
    } else {
      result = condition.values.some(val => {
        const valLower = String(val).toLowerCase();
        return fieldValue.toLowerCase() === valLower;
      });
    }
  }
  // Handle other operators
  else {
    const testValue = String(condition.value);
    
    if (!testValue && condition.operator !== 'empty' && condition.operator !== 'not-empty') {
      result = true; // Empty condition matches everything
    } else {
      try {
        if (condition.useRegex) {
          const regex = new RegExp(testValue, 'i'); // Case insensitive
          switch (condition.operator) {
            case 'equals':
            case 'contains':
              result = regex.test(fieldValue);
              break;
            case 'not-equals':
            case 'not-contains':
              result = !regex.test(fieldValue);
              break;
            case 'starts-with':
              result = new RegExp('^' + testValue, 'i').test(fieldValue);
              break;
            case 'ends-with':
              result = new RegExp(testValue + '$', 'i').test(fieldValue);
              break;
            default:
              result = true;
          }
        } else {
          const fieldLower = fieldValue.toLowerCase();
          const testLower = testValue.toLowerCase();
          
          switch (condition.operator) {
            case 'equals':
              result = fieldLower === testLower;
              break;
            case 'not-equals':
              result = fieldLower !== testLower;
              break;
            case 'contains':
              result = fieldLower.includes(testLower);
              break;
            case 'not-contains':
              result = !fieldLower.includes(testLower);
              break;
            case 'starts-with':
              result = fieldLower.startsWith(testLower);
              break;
            case 'ends-with':
              result = fieldLower.endsWith(testLower);
              break;
            case 'empty':
              result = fieldValue === '';
              break;
            case 'not-empty':
              result = fieldValue !== '';
              break;
            default:
              result = true;
          }
        }
      } catch (error) {
        console.error('Filter evaluation error:', error);
        result = false; // Invalid regex or other error
      }
    }
  }
  
  // Apply negation if NOT is checked
  return condition.negate ? !result : result;
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
      const isMultiSelect = condition.operator === 'in-list';
      const isEmptyOperator = condition.operator === 'empty' || condition.operator === 'not-empty';
      const fieldValues = getFieldValues(condition.field);
      
      html += `
        <div class="filter-condition" data-condition-id="${condition.id}">
          <div class="filter-field">
            <label>Field</label>
            <select class="condition-field" data-group-id="${group.id}" data-condition-id="${condition.id}">
              ${state.fields.map(field => 
                `<option value="${escapeHtml(field)}" ${field === condition.field ? 'selected' : ''}>${escapeHtml(field)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="filter-field">
            <label>Operator</label>
            <select class="condition-operator" data-group-id="${group.id}" data-condition-id="${condition.id}">
              <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>Equals</option>
              <option value="not-equals" ${condition.operator === 'not-equals' ? 'selected' : ''}>Not Equals</option>
              <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>Contains</option>
              <option value="not-contains" ${condition.operator === 'not-contains' ? 'selected' : ''}>Not Contains</option>
              <option value="starts-with" ${condition.operator === 'starts-with' ? 'selected' : ''}>Starts With</option>
              <option value="ends-with" ${condition.operator === 'ends-with' ? 'selected' : ''}>Ends With</option>
              <option value="in-list" ${condition.operator === 'in-list' ? 'selected' : ''}>In List</option>
              <option value="empty" ${condition.operator === 'empty' ? 'selected' : ''}>Is Empty</option>
              <option value="not-empty" ${condition.operator === 'not-empty' ? 'selected' : ''}>Not Empty</option>
            </select>
          </div>
          <div class="filter-field" ${isMultiSelect || isEmptyOperator ? 'style="display:none;"' : ''}>
            <label>Value</label>
            <input type="text" class="condition-value" 
              data-group-id="${group.id}" 
              data-condition-id="${condition.id}"
              value="${escapeHtml(condition.value)}"
              placeholder="Filter value"
              ${isEmptyOperator ? 'disabled' : ''}>
          </div>
          <div class="filter-field filter-multiselect" ${isMultiSelect ? '' : 'style="display:none;"'}>
            <label>Values (Ctrl/Cmd+Click for multiple)</label>
            <select multiple class="condition-values" 
              data-group-id="${group.id}" 
              data-condition-id="${condition.id}"
              size="5">
              ${fieldValues.map(val => {
                const selected = condition.values && condition.values.includes(val) ? 'selected' : '';
                return `<option value="${escapeHtml(val)}" ${selected}>${escapeHtml(val)}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="regex-toggle" ${isMultiSelect || isEmptyOperator ? 'style="display:none;"' : ''}>
            <input type="checkbox" 
              class="condition-regex" 
              id="regex-${condition.id}"
              data-group-id="${group.id}" 
              data-condition-id="${condition.id}"
              ${condition.useRegex ? 'checked' : ''}>
            <label for="regex-${condition.id}">Regex</label>
          </div>
          <div class="not-toggle">
            <input type="checkbox" 
              class="condition-negate" 
              id="negate-${condition.id}"
              data-group-id="${group.id}" 
              data-condition-id="${condition.id}"
              ${condition.negate ? 'checked' : ''}>
            <label for="negate-${condition.id}">NOT</label>
          </div>
          <button class="remove-condition-btn" 
            data-group-id="${group.id}" 
            data-condition-id="${condition.id}">×</button>
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
      // Re-render to update available values for multi-select
      const groupId = parseInt(e.target.dataset.groupId);
      const conditionId = parseInt(e.target.dataset.conditionId);
      const group = state.filterGroups.find(g => g.id === groupId);
      const condition = group?.conditions.find(c => c.id === conditionId);
      if (condition && condition.operator === 'in-list') {
        renderFilterGroups();
      }
    });
  });
  
  // Condition operator changes
  document.querySelectorAll('.condition-operator').forEach(select => {
    select.addEventListener('change', (e) => {
      updateConditionField(e.target);
      // Re-render to show/hide appropriate input fields
      renderFilterGroups();
    });
  });
  
  // Condition value changes
  document.querySelectorAll('.condition-value').forEach(input => {
    input.addEventListener('input', (e) => {
      updateConditionField(e.target);
    });
  });
  
  // Multi-select values changes
  document.querySelectorAll('.condition-values').forEach(select => {
    select.addEventListener('change', (e) => {
      const groupId = parseInt(e.target.dataset.groupId);
      const conditionId = parseInt(e.target.dataset.conditionId);
      const group = state.filterGroups.find(g => g.id === groupId);
      if (!group) return;
      
      const condition = group.conditions.find(c => c.id === conditionId);
      if (!condition) return;
      
      condition.values = Array.from(e.target.selectedOptions).map(opt => opt.value);
    });
  });
  
  // Regex checkbox changes
  document.querySelectorAll('.condition-regex').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      updateConditionField(e.target);
    });
  });
  
  // NOT checkbox changes
  document.querySelectorAll('.condition-negate').forEach(checkbox => {
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
  } else if (element.classList.contains('condition-negate')) {
    condition.negate = element.checked;
  }
}

// ===== Pivot Refresh =====
function refreshPivotWithFilters() {
  // Reapply filters and regenerate pivot table
  const rowField = state.pivotConfig.rowField;
  const colField = state.pivotConfig.colField;
  
  if (!rowField || !colField) return;
  
  const filteredRecords = applyFilters(state.records);
  state.filteredRecordsCache = filteredRecords;
  
  state.pivotData = generatePivotTable(filteredRecords, rowField, colField);
  renderPivotTable(state.pivotData, filteredRecords.length, state.records.length);
}

// ===== Rendering Functions =====
function renderPivotTable(pivotData, filteredCount, totalCount) {
  const table = document.getElementById('pivot-table');
  const info = document.getElementById('pivot-info');
  
  const filterInfo = filteredCount < totalCount 
    ? ` (${filteredCount} after filtering from ${totalCount} total)` 
    : '';
  
  info.innerHTML = `
    <strong>Rows:</strong> ${pivotData.rowField} | 
    <strong>Columns:</strong> ${pivotData.colField} | 
    <strong>Records:</strong> ${filteredCount}${filterInfo}
  `;

  // Build table HTML
  let html = '<thead><tr><th></th>';
  
  // Column headers
  pivotData.colValues.forEach((colVal) => {
    html += `<th>${escapeHtml(colVal)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Rows
  pivotData.rowValues.forEach((rowVal) => {
    html += `<tr><th>${escapeHtml(rowVal)}</th>`;
    
    pivotData.colValues.forEach((colVal) => {
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
  const hiddenFields = prefs.order.filter(f => !prefs.visible[f]);

  // Update hidden columns dropdown
  updateHiddenColumnsDropdown(hiddenFields);

  // Render table header with X buttons and drag handles
  let headerHtml = '<tr>';
  visibleFields.forEach((field, index) => {
    headerHtml += `<th draggable="true" data-field="${escapeHtml(field)}" data-index="${index}" class="draggable-header">
      <div class="header-cell">
        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        <span class="header-label">${escapeHtml(field)}</span>
        <button class="hide-column-btn" data-field="${escapeHtml(field)}" title="Hide column">✕</button>
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

  // Add hide button handlers
  header.querySelectorAll('.hide-column-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = e.target.dataset.field;
      hideColumn(field);
    });
  });

  // Add drag and drop handlers
  attachDragAndDropHandlers();
}

function hideColumn(field) {
  const prefs = state.columnPreferences[state.database];
  prefs.visible[field] = false;
  saveColumnPreferences();
  renderDatasheet(state.currentFilter.records);
}

function showColumn(field) {
  const prefs = state.columnPreferences[state.database];
  prefs.visible[field] = true;
  saveColumnPreferences();
  renderDatasheet(state.currentFilter.records);
}

function updateHiddenColumnsDropdown(hiddenFields) {
  const btn = document.getElementById('show-hidden-columns-btn');
  const dropdown = document.getElementById('hidden-columns-dropdown');
  const countSpan = document.getElementById('hidden-count');
  
  countSpan.textContent = hiddenFields.length;
  
  if (hiddenFields.length === 0) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    dropdown.classList.add('hidden');
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
  
  // Render hidden columns list
  let html = '<div class="dropdown-header">Hidden Columns</div>';
  hiddenFields.forEach(field => {
    html += `
      <div class="dropdown-item" data-field="${escapeHtml(field)}">
        <span>${escapeHtml(field)}</span>
        <button class="show-column-btn" data-field="${escapeHtml(field)}" title="Show column">👁</button>
      </div>
    `;
  });
  dropdown.innerHTML = html;
  
  // Add show button handlers
  dropdown.querySelectorAll('.show-column-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = e.target.dataset.field;
      showColumn(field);
    });
  });
}

function attachDragAndDropHandlers() {
  const headers = document.querySelectorAll('.draggable-header');
  let draggedElement = null;
  let draggedField = null;
  
  headers.forEach(header => {
    header.addEventListener('dragstart', (e) => {
      draggedElement = header;
      draggedField = header.dataset.field;
      header.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    header.addEventListener('dragend', (e) => {
      header.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    
    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (header !== draggedElement) {
        header.classList.add('drag-over');
      }
    });
    
    header.addEventListener('dragleave', (e) => {
      header.classList.remove('drag-over');
    });
    
    header.addEventListener('drop', (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');
      
      if (header !== draggedElement) {
        const targetField = header.dataset.field;
        reorderColumns(draggedField, targetField);
      }
    });
  });
}

function reorderColumns(draggedField, targetField) {
  const prefs = state.columnPreferences[state.database];
  const draggedIndex = prefs.order.indexOf(draggedField);
  const targetIndex = prefs.order.indexOf(targetField);
  
  // Remove dragged field from its position
  prefs.order.splice(draggedIndex, 1);
  
  // Insert at target position
  const newTargetIndex = prefs.order.indexOf(targetField);
  prefs.order.splice(newTargetIndex, 0, draggedField);
  
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

  // Pivot refresh button
  document.getElementById('refresh-pivot-btn').addEventListener('click', () => {
    refreshPivotWithFilters();
  });

  // Navigation buttons
  document.getElementById('back-to-config').addEventListener('click', () => {
    showSection('config');
  });

  document.getElementById('back-to-pivot').addEventListener('click', () => {
    showSection('pivot');
  });

  // Show hidden columns dropdown toggle
  document.getElementById('show-hidden-columns-btn').addEventListener('click', () => {
    const dropdown = document.getElementById('hidden-columns-dropdown');
    dropdown.classList.toggle('hidden');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('hidden-columns-dropdown');
    const btn = document.getElementById('show-hidden-columns-btn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
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
