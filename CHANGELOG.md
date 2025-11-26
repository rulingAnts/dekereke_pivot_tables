# Changelog

## Version 1.2.0 - Multi-Select Filters and UX Simplification

### Added
- **Multi-Select Filter**: New "in-list" operator allows selecting multiple values from a dropdown list
  - Dropdown is automatically populated with unique field values from the dataset
  - Values are cached for performance
  - Match records where field value equals ANY of the selected values

- **NOT Checkbox**: Added negation capability to all filter conditions
  - Checkbox appears next to every filter condition
  - Inverts the result of any operator (equals, contains, starts-with, etc.)
  - Examples: "NOT contains X", "NOT in-list [A, B, C]"

### Changed
- **Simplified UX**: Removed independent pivot table row/column visibility controls
  - Previously had dual control mechanisms: filters AND separate show/hide toggles
  - User feedback indicated this was confusing and not user-friendly
  - Now filters are the single, clear way to control what appears in pivot tables
  - Cleaner interface with just filter groups and pivot refresh button

### Removed
- Pivot visibility control panel UI
- Functions: initializePivotVisibility, renderPivotVisibilityControls, attachPivotVisibilityListeners, toggleAllRows, toggleAllCols, addHiddenRows, addHiddenCols, updatePivotDisplay, renderPivotTableWithVisibility
- Event listeners for visibility toggle buttons
- CSS styles for visibility controls
- State management for pivotVisibility

### Technical Details
- Updated `addFilterCondition()` to include `values[]` array and `negate` boolean
- Added `getFieldValues()` function to cache unique values per field
- Modified `evaluateCondition()` to handle "in-list" operator and negate flag
- Updated `renderFilterGroups()` to show multi-select dropdown and NOT checkbox dynamically
- Simplified `renderPivotTable()` back to standalone function without visibility parameters
- Service worker cache version bumped to v1.2.0

### Migration Notes
- No user action required
- Existing filter configurations will continue to work
- Service worker will auto-update cached files
- Any saved localStorage preferences remain intact

---

## Version 1.1.0 - Advanced Filtering

### Added
- Filter groups with OR logic between groups
- Multiple conditions per group with AND/OR logic
- Regex support for pattern matching
- Various operators: equals, not-equals, contains, not-contains, starts-with, ends-with, empty, not-empty
- Filter refresh functionality
- Comprehensive regex help modal

---

## Version 1.0.0 - Initial Release

### Added
- Progressive Web App with aggressive offline caching
- XML file loading with UTF-16 encoding support
- Pivot table generation from any two fields
- Interactive cell drill-down to detailed data sheet
- Column preference persistence via localStorage
- Service worker with cache-first strategy
- GitHub Pages deployment ready
