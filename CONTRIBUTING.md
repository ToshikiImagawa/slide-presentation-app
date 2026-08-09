# Contributing

**English** | [日本語](CONTRIBUTING.ja.md)

This guide covers building the app from source, implementing custom components (add-ons), and exporting slide
packages from the CLI. For how to use the app itself, see [README.md](README.md).

## Setup

```bash
npm install
```

Running the app requires a Rust toolchain (`cargo`/`rustc`) for Tauri. See the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) if you don't have one yet.

## Commands

| Command                        | Description                                                                             |
|--------------------------------|-----------------------------------------------------------------------------------------|
| `npm run tauri:dev`            | Start the desktop app (Tauri + addon build + Vite HMR)                                  |
| `npm run tauri:build`          | Build the desktop app bundle                                                            |
| `npm run dev`                  | Start frontend-only dev server (addon build + Vite HMR)                                 |
| `npm run build`                | Frontend-only production build (addon build + output to `dist/`)                        |
| `npm run build:addons`         | Build addons only                                                                       |
| `npm run preview`              | Preview built files                                                                     |
| `npm run format`               | Format code with Prettier (`src/**/*.{ts,tsx,css}`)                                     |
| `npm run typecheck`            | TypeScript type check                                                                   |
| `npm run export:slides`        | Export slide content as a distributable package (.spkg)                                 |
| `npm run generate-icons`       | Regenerate `src-tauri/icons/` from `resources/icon.svg` (macOS only)                    |
| `npm run generate-docs`        | Render `README.md` / `CHANGELOG.md` to PDF under `docs/`                                |

## Adding Addons

Add custom components as addons for use within slides.

### 1. Create the addon directory

```
addons/src/{addon-name}/
├── entry.ts         # Component registration
└── MyComponent.tsx  # Component implementation
```

### 2. Implement the component

```tsx
// addons/src/my-addon/MyComponent.tsx
const React = window.React;

export function MyComponent({ message }: { message: string }) {
  return React.createElement('div', null, message);
}
```

### 3. Register the component in the entry file

```ts
// addons/src/my-addon/entry.ts
import { MyComponent } from './MyComponent';

window.__ADDON_REGISTER__('my-addon', [
  { name: 'MyComponent', component: MyComponent },
]);
```

### 4. Build

```bash
npm run build:addons
```

### 5. Use in slides

```json
{
  "id": "custom-slide",
  "layout": "custom",
  "content": {
    "component": {
      "name": "MyComponent",
      "props": {
        "message": "Hello!"
      }
    }
  }
}
```

### Unresolved component references

If a slide master's `component` decoration (`theme.masters.*.decorations`) references a name that isn't
registered in `ComponentRegistry` (missing addon, addon rejected by the trust prompt, typo, etc.), that
decoration is silently skipped instead of falling back to a "Component not found" placeholder — otherwise
every slide using that master would show a dashed-border placeholder. The mismatch is instead surfaced once
as a warning toast on normal load (via `getMasterWarnings`/`getThemeWarnings`), so the deck still opens with
its plain theme and the user gets a single actionable notice rather than a broken deck with no explanation.

## Design Tokens

Slide components must not hardcode corner radii, border widths, accent widths, shadow opacities, or table
zebra shading. Reference the CSS variables below instead — they are declared in `src/styles/global.css` and
can be overridden per deck from `theme.tokens`. A component that hardcodes these values will not follow a
brand theme, which is exactly what makes a themed deck still look "not ours".

| Token                        | Default | What it controls                                                                            |
|------------------------------|---------|---------------------------------------------------------------------------------------------|
| `--theme-radius-sm`          | `8px`   | Panels and small chrome (`CodeBlockPanel`, inline `code`, Reveal's slide number)             |
| `--theme-radius-md`          | `12px`  | Mid-size surfaces and elements nested inside a card (`QrCodeCard`, the tile icon chip)       |
| `--theme-radius-lg`          | `16px`  | Cards (`MuiCard`, i.e. `FeatureTileGrid` tiles)                                              |
| `--theme-border-width`       | `1px`   | Hairline borders on cards and panels. Thick accent strokes keep their own component values   |
| `--theme-card-accent-width`  | `0px`   | Accent bar on a card's inner (left) edge. `0` means no bar, which is the default appearance  |
| `--theme-shadow-strength`    | `1`     | Multiplier applied to shadow opacities. `0` disables shadows, `2` doubles them               |
| `--theme-zebra-opacity`      | `0.04`  | Alpha of the background shaded on a table's even rows                                        |

Usage rules:

- Corner radii and border widths go straight into the property: `border-radius: var(--theme-radius-md)`,
  `border: var(--theme-border-width) solid var(--theme-border)`.
- Shadow opacity is a multiplier, so keep the component's own alpha and multiply it:
  `box-shadow: 0 2px 8px rgba(0, 0, 0, calc(0.04 * var(--theme-shadow-strength)))`. This keeps each shadow's
  relative depth while letting one theme knob scale all of them.
- `--theme-card-accent-width` defaults to `0`, so draw the bar with a pseudo element rather than
  `border-left` — a `0px` border would eat the card's hairline border on that edge.
- Components with a deliberately theme-independent look (`TerminalAnimation`, which hardcodes its terminal
  colors) and fallback/error UI (`FallbackImage`, the unresolved-component placeholder) stay outside this
  system on purpose.

Overriding from a deck's `theme.tokens`: keys are CSS variable names without the leading `--`, and the scope
key is either a `masterKey` (emitted as `section[data-master="<key>"]`) or `"*"` for the whole deck (emitted
as `:root`). When both set the same variable, the `masterKey` scope wins.

```json
{
  "theme": {
    "tokens": {
      "*": { "theme-radius-lg": "4px", "theme-border-width": "2px", "theme-card-accent-width": "6px" },
      "standard": { "theme-shadow-strength": "0" }
    }
  }
}
```

## Static Assets

Files placed in the `public/` directory are accessible at the root path after building.

| File                                  | URL                             |
|---------------------------------------|---------------------------------|
| `public/slides.json`                  | `/slides.json`                  |
| `public/theme-colors.json`            | `/theme-colors.json`            |
| `public/images/logo.png`              | `/images/logo.png`              |
| `public/voice/slide-01.wav`           | `/voice/slide-01.wav`           |
| `public/assets/locales/manifest.json` | `/assets/locales/manifest.json` |
| `public/assets/locales/en-US.json`    | `/assets/locales/en-US.json`    |

## Exporting and Bundling Slide Packages

You can also export a `.spkg` from the app's edit mode (see [Edit Mode in README.md](README.md#edit-mode)).
This section covers exporting from the CLI and bundling slides at build time.

### Export (Create Package)

```bash
npm run export:slides -- --name my-presentation --slides slides.json
```

| Option      | Required | Description                                           |
|-------------|:--------:|-------------------------------------------------------|
| `--name`    |   Yes    | Package name (generated as `@slides/{name}`)          |
| `--slides`  |   Yes    | Slide JSON filename under the source directory        |
| `--source`  |          | Base directory for the slide JSON and its assets (default: `public`) |
| `--version` |          | Version (default: `1.0.0`)                            |
| `--addons`  |          | Bundle built add-ons (`addons/dist`) into the package |
| `--strict`  |          | Fail if any referenced asset is missing (used when building distributables; the default only warns) |

This generates a `.spkg` file in `dist-slides/` (same tar+gzip format as `.tgz`, produced via `npm pack` and renamed
to a project-specific extension). Asset paths referenced in slides.json (`image/`, `voice/`, `theme/`, `font/`) are
auto-detected and included in the package. When `--addons` is passed, the built add-ons are bundled under `addons/`
and are dynamically loaded after the package is opened (Tauri runtime only — see below).

### Import (Use Package)

Specify a slide package via the `VITE_SLIDE_PACKAGE` environment variable.

#### Use with local path (no npm install required)

Specify the `.spkg` file (or a legacy `.tgz`) or extracted directory path in `.env.local`.

```bash
# Specify .spkg directly
VITE_SLIDE_PACKAGE=./dist-slides/slides-my-presentation-1.0.0.spkg

# Specify extracted directory
VITE_SLIDE_PACKAGE=./dist-slides/my-presentation
```

#### Use an installed npm package

If the package is already available as an npm dependency (e.g. published to a registry and installed with
`npm install @slides/my-presentation`), specify its package name directly.

```bash
VITE_SLIDE_PACKAGE=@slides/my-presentation
```

> **Note:** `npm run export:slides` outputs a `.spkg` file, and npm does not recognize that extension as an
> installable local tarball (unlike `.tgz`/`.tar.gz`/`.tar`), so `npm install ./dist-slides/xxx.spkg` does not work.
> To use a freshly exported package, use the local-path method above instead.

#### `VITE_SLIDE_PACKAGE` Value Reference

| Value                          | Behavior                                                               |
|--------------------------------|-------------------------------------------------------------------------|
| `./dist-slides/xxx-1.0.0.spkg` | Auto-extract `.spkg` (or legacy `.tgz`) for local use (no npm install) |
| `./dist-slides/xxx/`           | Read directly from extracted directory (no npm install)               |
| `@slides/xxx`                  | Read from an installed npm package                                    |
| (unset)                        | Auto-detect `@slides/*` packages                                      |

### Behavior

- If a file with the same name exists in `public/`, the `public/` file takes priority (package serves as fallback)
- During `npm run build`, package assets are copied to `dist/` (existing files are not overwritten)

## Distributing a Brand Theme Standalone

`meta.brandTheme` (a reference to an external `ThemeData` JSON — see [Design Tokens](#design-tokens) and
`applyThemeData`) lets an organization apply one brand theme across many decks, either as a plain colors-only
theme or a full theme with fonts, masters, tokens, and a logo. This section covers distributing that theme by
itself, independent of any slide deck (#210).

### Format

A standalone brand theme is **the `ThemeData` JSON file plus the asset files it references** (`image/`,
`font/`, `theme/` prefixes — the same convention as slide packages), not a `.spkg` archive. `fetchThemeData`
(`src/applyTheme.ts`) fetches this JSON directly with `fetch()`, so there is no unpacking step to design
around: the org hosts `theme.json` and its asset subdirectories at a stable URL, and `meta.brandTheme` points
at that `theme.json`.

When `meta.brandTheme` is an `https://` URL, `fetchThemeData` rewrites any `image/`/`font/`/`theme/`-prefixed
asset reference inside the fetched theme into an absolute URL resolved against the theme's own fetch URL
(mirroring how `resolveLocalAssetPaths` resolves local `.spkg` assets against `baseDir`). Without this, a
relative path like `font/corp.woff2` would resolve against the app's own origin instead of the theme's host
and 404. Local/relative `meta.brandTheme` references (bundled decks) are left untouched, since they already
resolve correctly against the document's base URI.

### Export (Create a Distributable Theme)

```bash
npm run export:theme -- --name acme-brand --theme theme/acme-brand.json
```

| Option       | Required | Description                                                                                    |
|--------------|:--------:|--------------------------------------------------------------------------------------------------|
| `--name`     |   Yes    | Output directory name under `dist-themes/`                                                       |
| `--theme`    |   Yes    | Theme JSON filename under the source directory                                                   |
| `--source`   |          | Base directory for the theme JSON and its assets (default: `public`)                             |
| `--base-url` |          | Public base URL to bake into asset references as absolute URLs (see below)                       |
| `--strict`   |          | Fail if any referenced asset is missing (used when building distributables; the default only warns) |

This writes `dist-themes/{name}/theme.json` plus the referenced asset files, mirroring the directory structure
of `--source`. Font sources with `redistribution: 'prohibited'` (#171) are excluded from the copy the same way
`export-slides.mjs` excludes them from a `.spkg` — the two scripts share the same `extractAssetPaths` /
`extractProhibitedFontPaths` functions so the rule has one source of truth.

Pass `--base-url` (e.g. a GitHub Releases download URL for a specific tag) to bake absolute asset URLs
directly into the exported `theme.json`. This is the recommended way to publish a versioned theme: attach
`theme.json` and its asset files individually to the same release, run the export once per version with that
release's `--base-url`, and point `meta.brandTheme` at the resulting `theme.json` URL. Without `--base-url`,
asset references stay relative, which only works if you host the output directory as-is (preserving the
`image/`/`font/` subdirectories) — `fetchThemeData`'s absolute-URL resolution (above) makes that work too, but
baking the URL in at export time is simpler to reason about.

### Versioning, Caching, and Offline Reapply

There is no version field on the wire — versioning is expressed by which URL `meta.brandTheme` points at
(e.g. a version-tagged release vs. an always-current "latest" one), the same way `resolveSamplePackageName`
distinguishes versioned and `latest` sample downloads in `src/sampleSlides.ts`.

`fetchThemeData` always tries the network first, then falls back:

- On success, the resolved `ThemeData` is written to the Cache Storage API (`caches`), keyed by the
  `meta.brandTheme` URL.
- On failure (offline, 404, etc.), it reads the same cache key and returns the last successfully fetched
  theme, so a deck that previously applied a brand theme keeps looking right when reopened offline.
- If there is no cached entry either (first fetch, or a Cache Storage-less environment), it returns
  `undefined` and the deck falls back to its own `theme`/`theme-colors.json` cascade — a brand theme is
  decoration, so a failed fetch never blocks opening the deck (see `applyPresentationTheme`'s cascade).

### Behavior

- `resolveBrandTheme` (`src/localSlideLoader.ts`, used when opening a local `.spkg`) resolves `meta.brandTheme`
  the same way regardless of where the deck itself came from: a relative path resolves fully offline against
  the package's `baseDir` (no network involved), while an `https://` URL delegates to `fetchThemeData` above —
  so a local `.spkg` deck that points `meta.brandTheme` at a remote URL still needs one successful fetch before
  offline reapply works, exactly like the browser/bundled path.
- `--strict` at export time is the equivalent of the accept criterion "a theme that references a missing
  asset should not silently ship with a broken logo/font" — use it when building a distributable, and leave
  it off for local iteration.

## Release Process

1. Bump the version — via the `prepare-release` skill, or manually update `package.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and the version badges in
   `README.md` / `README.ja.md`, and add the release notes to `CHANGELOG.md` / `CHANGELOG.ja.md`.
2. Open a PR with these changes and merge it into `main` once CI passes.
3. Push a tag matching the new version:

   ```bash
   git tag v<version>
   git push origin v<version>
   ```

4. The tag push triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which:
   - builds signed installers for macOS, Windows, and Linux,
   - creates a **draft** GitHub Release with those installers attached,
   - generates and attaches the updater manifest (`latest.json`), and
   - automatically un-drafts (publishes) the release once the manifest step succeeds — there is no manual
     approval gate in this workflow. If you need to review the draft release before it goes public, check the
     [Releases page](https://github.com/ToshikiImagawa/slide-presentation-app/releases) any time after the tag
     push, before the workflow completes.

### Tag naming

- Stable releases: `v<major>.<minor>.<patch>` (e.g. `v1.2.0`)
- Pre-releases: append `-alpha`, `-beta`, or `-rc` (e.g. `v1.2.0-beta`, `v1.2.0-rc.1`) — `release.yml` detects
  this suffix and marks the GitHub Release as a pre-release automatically

### Required secrets

The release workflow depends on several GitHub Actions secrets (code-signing certificates, updater signing key,
etc.). See [docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md) for the full list, how to obtain each one, where to
register them, and the fallback behavior when a secret is left unconfigured.

## License

MIT
