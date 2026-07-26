# Changelog

**English** | [日本語](CHANGELOG.ja.md)

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Edit Mode** — Author and package slides directly in the app (toggle from the toolbar **Edit** button)
    - Metadata form + full-width `slides.json` editor sharing a single source of truth, with a live preview rendered by
      the production renderer (theme edits reflected live)
    - Save the edited `slides.json` locally, and export a `.tgz` slide package (name / version, referenced assets bundled)
    - Validation gating: save / export disabled and preview hidden while the JSON has a syntax or schema error
    - Filesystem writes happen only in edit mode, performed at the Rust boundary (least privilege)
- **Addon Detachment (3 layers)** — Control over bundled executable addons
    - Runtime trust per package (confirmation prompt on open + Settings, default denied; global disable takes precedence)
    - Export bundling selection (in-app **Bundled add-ons** checkboxes and `npm run export:slides --addons a,b`); the choices union package add-ons with dev built-in add-ons, and the list stays visible with an empty-state note even when none are available
    - Dev-only built-in add/remove of `addons/src/<name>/entry.ts` (delete now asks for confirmation first — it permanently removes the source and is outside git, so it cannot be undone), plus an in-app **Build** button that runs `npm run build:addons` so a newly added/removed addon is reflected in the bundle candidates without a terminal
- **AI Slide Generation** — Generate `slides.json` from a prompt via the **AI Generate** panel in edit mode, applied to the editor via a diff-confirmation dialog
    - Switch between built-in (Vertex AI via GCP ADC; project / region / model configured) and external (local `claude` CLI) under a single contract
    - Auth uses GCP ADC (`gcloud auth application-default login`); the access token is obtained at the Rust boundary (cached ~55 min) and never exposed to the web layer (least privilege)
    - Import-time validation with an auto-repair loop (up to 3 attempts; best candidate retained at the limit), progress display, cancellation, and safe fallback to manual editing on failure
    - Before applying, a diff-confirmation dialog previews the structural changes (added / changed / removed slides and meta changes) for **Apply** / **Cancel** (Cancel leaves the editor untouched); on apply the JSON is normalized to 2-space indentation
    - Generation, GCP settings/login, and networking are enabled only in edit mode with generation active (pre-gate disables when the Vertex settings are incomplete or the CLI is not found)

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
