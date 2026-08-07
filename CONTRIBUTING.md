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
