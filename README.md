# Radio Ghost

Speak now, darling. The ghost will tidy the vowels.

Radio Ghost is an early standalone browser audio app for recording, importing, playing, and exporting voice audio.

Current build: `0.1.0-alpha.1`

This is a young project with a lot of room to grow. The current goal is simple: build the recording and file-handling foundation first, then layer in voice shaping, accent work, and more deliberate audio tools over time.

## Current Features

- Added microphone recording.
- Added `.wav` and `.mp3` import.
- Added playback for recorded and imported audio.
- Added `.wav` export.
- Added `.mp3` export.
- Added GitHub Pages friendly standalone browser hosting.

## Build Notes

- Added a dark browser interface under the Radio Ghost name.
- Added a browser file picker for importing audio.
- Added browser downloads for exported audio.
- Added local MP3 encoding through a vendored `lamejs` browser build.
- Patched the original WebM-only recording flow into WAV and MP3 export paths.
- Patched the Electron prototype into a static app that can run on GitHub Pages.
- Removed the old Voice Shaper naming from the app surface and package metadata.
- Removed the Electron desktop bridge from the runtime path.

## Requirements

- Node.js 20 or newer
- npm

The app itself runs in a modern browser. Microphone recording requires a secure context such as `https://` or `localhost`.

## Development

Install dependencies:

```powershell
npm install
```

Run the app locally:

```powershell
npm start
```

Check JavaScript syntax:

```powershell
npm run check
```

## GitHub Pages

Radio Ghost can be hosted directly from the repository root with GitHub Pages. The app entry point is `index.html`.

## Versioning

Radio Ghost uses pre-1.0 semantic versioning:

- `0.1.0-alpha.x` for the first usable prototype builds
- `0.x.0` for meaningful feature additions
- `0.x.y` for bug fixes and small refinements
- `1.0.0` once the app is stable enough for a general release

## Roadmap

- Add non-destructive audio effect controls.
- Add pitch and formant shifting.
- Add presets for subtle, natural, and theatrical voice shaping.
- Add waveform editing.
- Add project/session saving.
- Add voice analysis and coaching tools.
- Explore accent and vowel-shaping workflows.

## License

No license has been selected yet.
