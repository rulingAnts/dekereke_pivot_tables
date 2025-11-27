# Dekereke Pivot Tables

A Progressive Web App (PWA) for building pivot tables from Dekereke XML databases. All data processing happens locally in your browser - nothing is uploaded to any server.

## Features

- ✅ **100% Client-Side**: All data stays in your browser
- 📴 **Offline-Capable**: Works without internet connection
- 🔄 **Auto-Updates**: Automatically updates when new versions are available
- 🔒 **Privacy-First**: No data leaves your device
- 📊 **Interactive Pivot Tables**: Cross-tabulate any two fields
- 🔍 **Advanced Filtering**: Multiple filter groups with regex, multi-select, and NOT operators
- 🎯 **Multi-Select Filters**: Choose multiple values from dropdown lists
- ❌ **NOT Operator**: Negate any filter condition with a checkbox
- 📋 **Data Filtering**: Click cells to view matching records
- ⚙️ **Column Control**: Show/hide and reorder columns in datasheet view
- 💾 **Persistent Settings**: Column preferences saved across sessions
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile

## Quick Start

### Local Development

1. **Start the development server**:
   ```bash
   python3 serve.py
   ```

2. **Open your browser**:
   Navigate to `http://localhost:8000`

3. **Load a database**:
   Click "Choose XML File" and select your Dekereke XML database file

4. **Build a pivot table**:
   - Select a field for rows (e.g., "Surface_Melody")
   - Select a field for columns (e.g., "SyllableProfile")
   - (Optional) Add advanced filters:
     - Use multiple filter groups (OR logic between groups)
     - Add multiple conditions per group (AND/OR logic within group)
     - Choose from operators: equals, contains, starts-with, in-list, regex, empty, etc.
     - Use multi-select dropdown for "in-list" to select multiple values
     - Check NOT checkbox to negate any condition
   - Click "Generate Pivot Table"

5. **Update your pivot table**:
   - Click "🔄 Refresh with Current Filters" to update after changing filters
   - Filters control what records appear in the pivot table

6. **Explore your data**:
   - Click any cell to see matching records
   - Show/hide columns as needed
   - Reorder columns by clicking the arrow buttons

## Dekereke Database Format

The app expects XML files with this structure:

```xml
<?xml version='1.0' encoding='utf-16'?>
<phon_data>
  <data_form>
    <Reference>0012</Reference>
    <Gloss>example</Gloss>
    <SyllableProfile>CV.CV</SyllableProfile>
    <ToneMelody>H</ToneMelody>
    <!-- Additional fields... -->
  </data_form>
  <!-- More data_form elements... -->
</phon_data>
```

### Key Points:
- **Encoding**: UTF-16
- **Root element**: `<phon_data>`
- **Records**: `<data_form>` elements
- **Fields**: Child elements of `<data_form>`
- **Reference IDs**: Leading zeros are preserved

## Deployment to GitHub Pages

1. **Prepare your repository**:
   ```bash
   # Ensure all changes are committed
   git add docs/
   git commit -m "Add Dekereke Pivot Tables PWA"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Source", select **main** branch and **/docs** folder
   - Click **Save**

3. **Access your app**:
   Your app will be available at:
   ```
   https://[your-username].github.io/[repository-name]/
   ```

4. **Install as PWA** (optional):
   - Visit the deployed URL in Chrome, Edge, or Safari
   - Look for the "Install" button in the address bar
   - Click to install as a standalone app

## File Structure

```
dekereke_pivot_tables/
├── docs/                      # GitHub Pages serves from here
│   ├── index.html            # Main HTML file
│   ├── app.js                # Application logic
│   ├── styles.css            # Styling
│   ├── sw.js                 # Service worker (offline support)
│   ├── manifest.json         # PWA manifest
│   └── icons/                # App icons
│       ├── icon-192.png
│       └── icon-512.png
├── serve.py                  # Development server script
└── README.md                 # This file
```

## How It Works

### Data Processing
1. **File Loading**: XML file is read with UTF-16 encoding
2. **Parsing**: DOMParser extracts all `<data_form>` records
3. **Field Detection**: All unique field names are collected
4. **Pivot Calculation**: Records are grouped by selected row/column values
5. **Display**: Interactive table shows counts, clickable to view details

### Offline Support
- **Service Worker**: Caches all app files on first visit
- **Cache-First Strategy**: Serves from cache when offline
- **Auto-Update**: Checks for new versions every 60 seconds when online
- **Update Prompt**: Banner appears when new version is available

### Data Storage
- **In-Memory**: Loaded database stays in JavaScript memory
- **LocalStorage**: Column preferences persist across sessions
- **No Backend**: No server-side processing or storage

## Browser Compatibility

- ✅ Chrome 67+
- ✅ Edge 79+
- ✅ Safari 11.1+
- ✅ Firefox 63+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Customization

### Update the Version
When you make changes, update the cache version in `docs/sw.js`:
```javascript
const CACHE_NAME = 'dekereke-pivot-v1.2.1'; // Increment version
```

### Modify Icons
Replace `docs/icons/icon-192.png` and `docs/icons/icon-512.png` with your custom icons. Use solid colors and simple designs for best results.

### Change Theme Colors
Edit CSS variables in `docs/styles.css`:
```css
:root {
  --primary-color: #2c3e50;
  --secondary-color: #3498db;
  /* ... more colors ... */
}
```

## Troubleshooting

### App not updating
1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Clear cache in browser settings
3. Unregister service worker in DevTools → Application → Service Workers

### XML file not loading
- Ensure file is valid XML
- Check encoding is UTF-16
- Verify root element is `<phon_data>`
- Look for parsing errors in browser console

### Pivot table not generating
- Ensure you've selected two different fields
- Check that records have values in selected fields
- Look for JavaScript errors in browser console

### Offline mode not working
- Visit the site while online first (to cache assets)
- Check service worker is registered in DevTools
- Ensure you're serving via HTTPS (required for PWA features)
  - Exception: `localhost` works without HTTPS

## Development Tips

### Viewing Console Logs
Press `F12` or `Cmd+Option+I` to open browser DevTools and view console logs.

### Testing Offline Mode
1. Open DevTools → Network tab
2. Check "Offline" to simulate no connection
3. Reload the page - app should still work

### Debugging Service Worker
1. Open DevTools → Application tab
2. Click "Service Workers" in sidebar
3. View registration status and console logs

## Future Enhancements

- [ ] Audio playback for recording fields
- [ ] Export pivot tables to CSV/Excel
- [ ] Multiple database comparison
- [ ] Advanced filtering options
- [ ] Statistical summaries
- [ ] Dark mode theme

## License

This project is open source and available under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

## Attribution

This project was created with the assistance of GitHub Copilot.

## Support

For issues or questions, please open an issue on the GitHub repository.

---

**Made with ❤️ for linguistic research**
