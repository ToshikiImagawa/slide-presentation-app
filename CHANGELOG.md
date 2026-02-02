# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-02

First release. A presentation tool that defines slides with JSON data and displays them in the browser.

### Added

- **5 Layout Types** — Switch between `center` / `content` / `two-column` / `bleed` / `custom` via the `layout` field
- **Theme Customization** — Customize via the `theme` field in slides.json (colors, fonts, custom CSS) or override
  colors with `theme-colors.json`
    - Custom font loading (local files / Google Fonts)
    - Global font size scaling via `baseFontSize`
    - All colors applied as CSS variables (with `-rgb` variants for `rgba()` support)
- **Voice Guide & Auto-Advance** — Assign audio files per slide
    - Manual playback (play/stop via speaker icon)
    - Auto-play (automatically play audio on slide transition)
    - Auto-slideshow (automatically advance to the next slide when audio ends)
- **Presenter View** — Open a dedicated presenter window
    - Speaker notes, key point summary, next/previous slide preview
    - Bidirectional real-time sync with main window via BroadcastChannel
    - Keyboard navigation (arrow keys / space)
    - Audio control from the presenter view
- **Internationalization (i18n)** — Japanese (`ja-JP`) / English (`en-US`) / French (`fr-FR`)
    - Auto-detection from browser language settings
    - Manual switching from settings window (saved to `localStorage`)
- **Addon System** — Add and register custom components as addons
- **Slide Packages** — Export, import, and distribute slide content as npm packages
    - Generate `.tgz` packages with `npm run export:slides` (referenced assets auto-detected and bundled)
    - Import via `VITE_SLIDE_PACKAGE` environment variable (local path / npm package)
- **Logo Configuration** — Customize presentation logo via the `meta.logo` field
- **Slide Meta** — Control transitions, background color, and background image

### Tech Stack

| Category            | Technology                 |
|---------------------|----------------------------|
| Framework           | React 19                   |
| Presentation Engine | Reveal.js 5                |
| UI Components       | MUI (Material UI) 7        |
| Build Tool          | Vite 7                     |
| Language            | TypeScript 5 (strict mode) |
| Testing             | Vitest 4                   |
| Code Formatter      | Prettier                   |
