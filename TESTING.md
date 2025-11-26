# Testing Guide for Version 1.2.0

## Test Environment Setup
1. Start the development server: `python3 serve.py`
2. Open browser to `http://localhost:8000`
3. Open browser DevTools console to check for errors

## Test Cases

### 1. Multi-Select Filter ("in-list" operator)
**Test Steps:**
1. Load the Fayu_stable.xml database
2. Add a new filter condition
3. Select a field (e.g., "Surface_Form")
4. Change operator to "in-list"
5. Verify that a multi-select dropdown appears
6. Verify dropdown is populated with unique values from that field
7. Select multiple values (e.g., select 3-5 different surface forms)
8. Generate a pivot table with any two fields
9. Verify only records matching ANY of the selected values appear

**Expected Results:**
- Dropdown shows all unique values for the selected field
- Can select multiple values via Ctrl+Click (Windows/Linux) or Cmd+Click (Mac)
- Pivot table only includes records where field value is in the selected list
- Record count reflects filtered dataset

### 2. NOT Checkbox Negation
**Test Steps:**
1. Create a filter with "contains" operator
2. Enter a value (e.g., "test")
3. Check the NOT checkbox
4. Generate pivot table
5. Verify results are inverted (only records NOT containing "test" appear)
6. Test with other operators:
   - "NOT equals"
   - "NOT in-list" (should exclude all selected values)
   - "NOT starts-with"
   - "NOT regex"

**Expected Results:**
- NOT checkbox inverts the condition result
- Works with all operators
- Can combine with multiple filter groups (OR logic)
- Record count updates correctly

### 3. Combined Multi-Select and NOT
**Test Steps:**
1. Create filter with "in-list" operator
2. Select multiple values (e.g., values A, B, C)
3. Check the NOT checkbox
4. Generate pivot table
5. Verify results exclude all selected values (only records with values other than A, B, or C)

**Expected Results:**
- Records are excluded if field value matches ANY of the selected values
- Effectively creates an "exclude list" filter

### 4. UX Simplification Verification
**Test Steps:**
1. Generate a pivot table
2. Look at the pivot section controls
3. Verify NO visibility control panel exists
4. Verify NO "Show/Hide Rows/Columns" buttons exist
5. Verify ONLY the "Refresh Filters" button appears
6. Change filter settings
7. Click "Refresh Filters"
8. Verify pivot table updates based on new filter settings

**Expected Results:**
- Clean, simple interface with only filter-based controls
- No confusion about dual control mechanisms
- Filters are the single source of truth for what appears in pivot

### 5. Service Worker Update
**Test Steps:**
1. Open the app in browser
2. Check browser console for ServiceWorker messages
3. Verify cache version is "dekereke-pivot-v1.2.0"
4. Check that new files are cached
5. Go offline (disable network in DevTools)
6. Reload page
7. Verify app still works offline

**Expected Results:**
- Service worker installs and activates successfully
- New cache version created
- Old cache cleaned up
- Offline functionality works

### 6. Regression Testing
**Test Basic Functionality:**
1. Upload XML file (UTF-16 encoding)
2. Verify fields are detected
3. Select two fields for pivot
4. Generate pivot table
5. Click a cell with entries
6. Verify datasheet appears with correct records
7. Test column reordering in datasheet
8. Verify preferences persist on reload

**Test Existing Filter Features:**
1. Multiple filter groups (OR logic)
2. Multiple conditions per group (AND/OR logic)
3. All operators: equals, contains, starts-with, regex, empty, etc.
4. Regex patterns with modal help
5. Filter group deletion
6. Condition deletion
7. Logic toggle (AND/OR) between conditions

**Expected Results:**
- All existing features work as before
- No JavaScript errors in console
- Performance remains good
- UI remains responsive

## Performance Tests
1. Load large XML database
2. Create filter with many conditions
3. Generate pivot with many rows/columns
4. Verify UI remains responsive
5. Check memory usage doesn't grow excessively

## Browser Compatibility
Test on:
- Chrome/Edge (Chromium)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Android Chrome)

## Known Issues
None currently documented.

## Reporting Issues
If you find bugs:
1. Note browser and version
2. Copy console errors
3. Document exact steps to reproduce
4. Include sample data if possible (or describe data structure)
