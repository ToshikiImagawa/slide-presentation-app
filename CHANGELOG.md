# Changelog

**English** | [日本語](CHANGELOG.ja.md)

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.4.0] - 2026-08-27

### Added

- Added `meta.confidential`, a deck-wide watermark/confidential-text setting symmetric to `meta.logo`
- Added per-slide overrides for `meta.logo`/`meta.confidential` via `slides[].meta`, so a single slide can change or hide the logo/watermark without switching to a different master
- Added a "Check appearance and fix" button next to Generate in the AI Generation panel, which runs the same visual checks used by CI across every slide and asks the AI to fix any issues through the existing auto-repair loop

### Changed

- Changed the default position of `meta.confidential` from `bottom-left` to `top-right`, so a logo and a watermark placed together with no explicit `anchor`/`offset` no longer overlap by default (`meta.logo` still defaults to `bottom-left`)
- Strengthened the visual check to also detect content clipped by an inner container's own overflow, in addition to the existing overflow/safe-area/decoration-overlap/collapsed-fill-item checks

### Fixed

- Fixed the automatic update check silently failing when GitHub API rate limits were hit
- Fixed clipped content in a few sample deck guide slides

## [2.3.1] - 2026-08-26

### Added

- Added support for explicit line breaks (`\n`) in slide titles, so authors can control where a long title wraps

### Fixed

- Fixed PDF export failing on slides that contain a table

## [2.3.0] - 2026-08-24

### Added

- Added presentation recording: a toolbar button records the screen/window share together with the speaker-note voice playback, and saves the result as a video file

## [2.2.0] - 2026-08-19

### Added

- Added brand theme import: extract master colors, fonts, logos, page numbers, and fixed text deterministically from PowerPoint/Google Slides–derived theme files, with a side-by-side comparison and confirmation dialog before importing
  - Supports multiple slide masters/layouts, explicit light/dark designation, bundling embedded fonts, extracting brand mark candidates from small shapes on masters, and deterministic layout-assignment suggestions
- Added a standalone distribution format for brand themes, independent of the slide package
- Expanded master background decoration vocabulary: background patterns, watermarks, opacity, image backgrounds, fixed text and page numbers, and section footers
- Added the concept of sections, with chapter numbering and per-section accent colors
- Added many new slide types: table; charts (bar, line, pie, horizontal bar, big-number trend, KPI, KPI row); diagram primitives (arrows, connectors, cards, badges); compare and horizontal flow; table of contents; structure diagrams (hierarchy, server, org chart, UML class diagram); process diagrams (flowchart, swimlane, date timeline, Gantt); analysis diagrams (2x2 matrix, funnel, SWOT, heatmap); images (auto-fit, captions, frames, grouping, category headings); profile; UML sequence diagram; inline SVG and text diagrams (Mermaid); quote, big message, and closing slides; checklist and numbered multi-column lists
- Added a column count option (dateTimelineColumns) to date timelines so more than 8 items can wrap onto a single slide
- Expanded theme design tokens: rounded corners/border width/accent/zebra striping for cards and rules, heading underline width, decorative thick lines (heading side bar, top band, dividers, node rings), explicit tint/shade ramps for series colors, rounded rectangle/circle decoration, canvas size and safe area theming, and full coverage of the 12 theme color keys (including series, status, and link colors)
- Added in-app visual checks (overflow, safe-area intrusion, overlap with master decorations, insufficient contrast) that surface as warnings while editing
- Added warnings for invalid values, such as KPI/chart color token names and out-of-range or non-integer row/col/startCol in diagrams
- Added an error boundary so a rendering error on one slide no longer crashes the whole deck
- Added lazy loading for slide images to reduce rendering load

### Changed

- Changed AI generation results so they can be applied partially, per theme or per slide
- Changed AI generation to explicitly indicate whether an instruction is for new content or a modification of existing content
- Changed AI generation to detect truncation caused by hitting the token limit and feed it into the auto-fix loop
- Changed AI generation to reflect theme-derived design constraints (colors, fonts, etc.)
- Changed how master backgrounds are generated, prioritized, and defaulted, unifying previously inconsistent behavior
- Moved the brand theme import button to sit next to the "Theme" heading

### Fixed

- Fixed the auto-update check pointing at a draft, untagged asset URL and failing to find updates
- Fixed 5 visual defects, the app's language setting being ignored, and a safe-area intrusion in the distributed sample (template guide)
- Fixed PDF export where the entrance animation's final state wasn't committed inside the html2canvas clone, causing corrupted output
- Fixed the slide title's bottom margin being overridden by MUI's dynamic CSS
- Fixed diagram slides crashing when row/col/startCol was out of range or non-integer
- Fixed brand theme import not honoring an explicit light/dark designation
- Fixed typeface CSS variables being managed in two places, causing the wrong font to apply
- Fixed the logo to render through the unified master decoration vocabulary (LogoMasterDecoration), resolving inconsistencies between meta.logo and master-level decoration

## [2.1.1] - 2026-08-02

### Added

- Added the ability to configure Claude CLI environment variables (e.g. `CLAUDE_CONFIG_DIR`) for the external generation (Claude Code CLI) method

### Changed

- Changed the AI generation diff view from a side-by-side full-text comparison to a git-diff-style line-by-line view (added = green / removed = red)

### Fixed

- Fixed the generated diff dialog where long lines pushed the "after" column out of view due to a CSS Grid issue
- Fixed the external generation (Claude Code CLI) failure display to show the actual failure reason instead of a generic message
- Fixed the presenter view always starting from the first slide when opened while the main view had already advanced
- Fixed external generation CLI failures caused by tool-call turns being consumed, and unintended inclusion of the global CLAUDE.md

## [2.1.0] - 2026-07-30

### Added

- Auto-update check at launch (via GitHub API)
- Pause/resume for text-to-speech narration
- Toolbar button to export slides as PDF
- Open the Settings dialog from the edit screen
- Open Settings from the home screen on first launch to change the UI language

### Changed

- Unified the keyboard shortcuts list into the in-app dialog, resolving the conflict with Reveal.js's built-in help
- Updated the UI theme color to match the app logo (orange to mint green/slate)

### Fixed

- Fixed the PDF export button being unresponsive on macOS
- Fixed the seek bar restarting from 0% when pausing/resuming audio narration
- Fixed the edit screen's slide preview being left-aligned instead of centered
- Fixed slide package name validation rejecting underscores

## [2.0.0] - 2026-07-28

Slide Presentation App is now a desktop app. Beyond viewing, you can author, generate, and package slides inside the app
itself.

### Breaking Changes

- **Now a desktop app** — The browser-based viewer is replaced by a Tauri 2 (Rust) desktop app for macOS, Windows, and
  Linux, distributed as installers from GitHub Releases (`.dmg`, `.msi` / `-setup.exe`, `.deb` / `.rpm` / `.AppImage`)
    - The app starts on a **home screen** where you choose what to present, instead of rendering a bundled deck right
      away
    - The presenter view is a native window synced over Tauri events, replacing the browser popup and
      `BroadcastChannel`
    - Build-time bundling (`public/slides.json`, `VITE_SLIDE_PACKAGE`) still works unchanged
- **Slide package extension** — Exported slide packages now use a project-specific `.spkg` extension instead of `.tgz`
  (same tar+gzip format under the hood). Opening a package still accepts legacy `.tgz` files for backward
  compatibility. The CLI export (`npm run export:slides`) renames the `npm pack` output accordingly; as a result,
  installing a freshly exported package as a local npm tarball (`npm install ./dist-slides/xxx.tgz`) is no longer
  supported — use the `VITE_SLIDE_PACKAGE` local-path method instead (see [Slide Packages](README.md#slide-packages))

### Added

- **Home Screen** — Choose what to present on launch, and come back any time with the toolbar **Home** button
    - **Create with AI** (generate a deck from scratch), **Open a File** (`slides.json` / `.spkg`), **Open from a URL**
      (fetch a `.spkg` over HTTPS, cached locally), **Open Sample**, and **Recently Opened** — the recent list is
      persisted across launches and entries can be removed individually
    - The last opened file is remembered and reloaded automatically on the next launch
- **`.spkg` File Association** — Open a slide package straight from the OS file manager (double-click, or right-click →
  open with this app) on macOS, Windows, and Linux
    - When the app is not running it launches directly into the presentation, skipping the home screen; when it is
      already running the existing window is reused instead of opening a second one
    - In edit mode with unsaved changes, a confirmation dialog appears first so nothing is discarded silently
    - Cache extraction, relative asset resolution (`image/`, `voice/`, `theme/`, `font/`), embedded add-on trust
      prompts, and last-opened reload all behave exactly as they do for packages opened from the home screen
    - Only `.spkg` is registered with the OS; legacy `.tgz` packages remain openable from the home screen
- **Open from a URL** — Documented the existing home-screen action for fetching a `.spkg` over HTTPS
- **Edit Mode** — Author and package slides directly in the app (toggle from the toolbar **Edit** button)
    - Metadata form + full-width `slides.json` editor sharing a single source of truth, with a live preview rendered by
      the production renderer (theme edits reflected live)
    - The JSON editor has line numbers, syntax highlighting, and search / replace (`Ctrl`/`Cmd` + `F`)
    - Save the edited `slides.json` locally, and export a `.spkg` slide package (name / version, referenced assets bundled)
    - Validation gating: save / export disabled and preview hidden while the JSON has a syntax or schema error
    - Leaving edit mode with unsaved changes asks for confirmation first
    - Filesystem writes happen only in edit mode, performed at the Rust boundary (least privilege)
- **AI Slide Generation** — Generate `slides.json` from a prompt via the **AI Generate** panel in edit mode (or **Create with AI** on the home screen), applied to the editor via a diff-confirmation dialog
    - Switch between built-in (Vertex AI via GCP ADC; project / region / model configured) and external (local `claude` CLI) under a single contract
    - Auth uses GCP ADC (`gcloud auth application-default login`); the access token is obtained at the Rust boundary (cached ~55 min) and never exposed to the web layer (least privilege)
    - Import-time validation with an auto-repair loop (up to 3 attempts; best candidate retained at the limit), progress display, cancellation, and safe fallback to manual editing on failure
    - Before applying, a diff-confirmation dialog previews the structural changes (added / changed / removed slides and meta changes) for **Apply** / **Cancel** (Cancel leaves the editor untouched); on apply the JSON is normalized to 2-space indentation
    - Generation, GCP settings/login, and networking are enabled only in edit mode with generation active (pre-gate disables when the Vertex settings are incomplete or the CLI is not found)
- **Addon Detachment (3 layers)** — Control over bundled executable addons
    - Runtime trust per package (confirmation prompt on open + Settings, default denied; global disable takes precedence)
    - Export bundling selection (in-app **Bundled add-ons** checkboxes and `npm run export:slides --addons a,b`); the choices union package add-ons with dev built-in add-ons, and the list stays visible with an empty-state note even when none are available
    - Dev-only built-in add/remove of `addons/src/<name>/entry.ts` (delete asks for confirmation first — it permanently removes the source and is outside git, so it cannot be undone), plus an in-app **Build** button that runs `npm run build:addons` so a newly added/removed addon is reflected in the bundle candidates without a terminal
- **Keyboard Shortcuts & Toolbar Visibility** — Press `?` (or **Settings → Keyboard shortcuts**) for the full list of
  viewer and edit-mode shortcuts, and hide the toolbar entirely with the toolbar button or `T`
- **Progress and Failure Feedback** — Loading indicators while opening files and packages, plus toast notifications for
  failures that used to pass silently (theme apply, presenter-view launch, sample fetch)

### Changed

- **Sample deck distributed externally** — The template guide is no longer bundled into the app. It ships as a `.spkg`
  package attached to GitHub Releases and is fetched by **Open Sample** (see [Distributed Sample](README.md#distributed-sample))
    - Three sources are tried in order: a `slides.json` bundled at build time → the release asset pinned to the app
      version → the `latest` release asset. If none is reachable, a single slide asks you to check your network
      connection (app startup is unaffected)
    - The pinned asset never changes, so its extraction is cached and the sample opens offline from the second time on
    - The sample audio is no longer shipped in the app bundle, and sample updates are decoupled from app releases
    - Added a French sample (the UI already supported fr-FR, but the sample fell back to English)
    - `VITE_SAMPLE_PACKAGE_URL` / `VITE_SAMPLE_SOURCE=remote` override where the sample comes from
    - `npm run export:samples` exports every locale; `npm run export:slides` gained `--source` (input directory) and
      `--strict` (fail on missing referenced assets)
- **Settings and edit chrome** — The settings window is a real modal dialog (`Esc` to close, focus management,
  `role="dialog"`), and both the settings and the edit chrome use a fixed palette so they no longer inherit the colors
  of the deck you have open
- **Accessibility** — Icon buttons, toggles, and checkboxes expose consistent labels and pressed state

### Fixed

- **Clipped content in the distributed sample** — Split two overcrowded slides so nothing is cut off at 1280x720
    - "Presenter View" split into an overview and a panel list (the right column overflowed by 52px, clipping its
      heading and colliding with the page number)
    - "Logo & Font Settings" split into "Logo Settings" and "Font Settings" (overflowed by 237px, truncating the end of
      the code block)
- **Clipped content in the French sample** — Shortened the two lines on "Theme Configuration Details" that wrapped only
  in French, so its right column no longer overflows by 43px at 1280x720 (`slides.fr.json` only; ja / en already fit)
- **Timeline overflowing the slide** — The `steps` timeline bled 100px past each side of its parent, but `.content-area`
  only pads 40px, so it stuck out 60px beyond the 1280x720 slide and clipped the text of the outermost steps. The bleed
  is now derived from the same `--content-area-padding-x` variable as the padding, so the timeline spans exactly the
  slide width
- **Broken references in the sample** — Removed references to a non-existent audio file (English) and log file
  (`/demo-log.txt`)
- **Presenter view reliability** — Window close is detected via `onCloseRequested`, a failure to open the window is
  reported with a toast instead of passing silently, and the theme of a locally opened package is propagated to the
  presenter view
- **Validation errors no longer vanish when AI auto-repair gives up** — On reaching the retry limit, the remaining
  validation errors are shown in the diff-confirmation dialog
- **Built-in add-ons no longer leak into release builds** — Development-only built-in add-ons are gated to dev builds
  instead of being baked into a release
- **Exported packages keep the name you type** — A `slides-` prefix was being prepended to `.spkg` file names
- **Presentations start from the first slide** — The URL hash is reset before opening a deck, so it no longer jumps to
  the position left over from the previously viewed one
- **Theme, dialog, and list fixes** — A missing or unparsable `theme-colors.json` is treated as "no overrides" rather
  than an error, the recently-opened list scrolls with readable paths, and the per-package add-on trust list is limited
  to packages that actually have a trust decision (and scrolls when long)

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
