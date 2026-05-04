# Radio Ghost

Speak now, darling. The ghost will tidy the vowels.

Radio Ghost is a standalone browser audio app. It records from the microphone, imports `.wav` and `.mp3`, plays audio back, and exports `.wav` or `.mp3` files.

This repository is intentionally small. GitHub Pages only needs the static app files.

## Upload These

- `index.html`
- `styles.css`
- `renderer.js`
- `.nojekyll`
- `vendor/lame.min.js`

The `vendor/` folder contains third-party browser code used for MP3 export.

## Do Not Upload

- `node_modules/`
- `release/`
- Electron files
- npm package files

## Notes

- Added a standalone web app runtime.
- Added browser-native microphone recording.
- Added browser-native import and download export flows.
- Added cache-busted script and stylesheet links for GitHub Pages.
- Removed Electron, npm, packaging, and workflow files from the web app package.
- Patched the Stop button path with visible status updates for easier browser testing.
