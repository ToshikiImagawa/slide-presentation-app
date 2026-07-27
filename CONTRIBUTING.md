# Contributing

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
     [Releases page](https://github.com/ToshikiImagawa/slide-presentation-app/releases) during the short window
     between the `updater-manifest` and `publish` jobs.

### Tag naming

- Stable releases: `v<major>.<minor>.<patch>` (e.g. `v1.2.0`)
- Pre-releases: append `-alpha`, `-beta`, or `-rc` (e.g. `v1.2.0-beta`, `v1.2.0-rc.1`) — `release.yml` detects
  this suffix and marks the GitHub Release as a pre-release automatically

### Required secrets

The release workflow depends on several GitHub Actions secrets (code-signing certificates, updater signing key,
etc.). See [docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md) for the full list, how to obtain each one, where to
register them, and the fallback behavior when a secret is left unconfigured.
