#!/usr/bin/env node

/**
 * `tauri build` のラッパー。
 *
 * tauri.conf.json は bundle.createUpdaterArtifacts: true を既定にしているが、
 * Tauri v2 は pubkey 設定済みかつ署名鍵未設定だとビルドが失敗する
 * （"A public key has been found, but no private key"）。
 * TAURI_SIGNING_PRIVATE_KEY が無いローカル開発ビルドでは createUpdaterArtifacts を無効化し、
 * 署名鍵を注入できる CI/リリースビルドでのみ updater アーティファクトを生成する。
 *
 * Windows Authenticode 署名も同様に環境変数駆動。release.yml が証明書を import した
 * 場合のみ WINDOWS_CERT_THUMBPRINT を設定し、ここで bundle.windows.certificateThumbprint
 * として --config に反映する（#25）。
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// pathname は Windows で先頭スラッシュ付き（/D:/...）になり cwd として不正なため fileURLToPath を使う
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const hasSigningKey = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY)
const windowsCertThumbprint = process.env.WINDOWS_CERT_THUMBPRINT

const config = { bundle: {} }
if (!hasSigningKey) {
  console.log('TAURI_SIGNING_PRIVATE_KEY が未設定のため createUpdaterArtifacts を無効化します')
  config.bundle.createUpdaterArtifacts = false
}
if (windowsCertThumbprint) {
  console.log('WINDOWS_CERT_THUMBPRINT が設定されているため Authenticode 署名を有効化します')
  config.bundle.windows = { certificateThumbprint: windowsCertThumbprint }
}

const args = ['build']
if (Object.keys(config.bundle).length > 0) {
  args.push('--config', JSON.stringify(config))
}

// npx は使わず CLI の JS エントリを node で直接実行する。
// Windows の npx は npx.cmd で、Node は CVE-2024-27980 の修正以降 shell を介さない
// spawn での .cmd 実行を拒否する（npx なら ENOENT、npx.cmd なら EINVAL）。
const tauriCli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js')

execFileSync(process.execPath, [tauriCli, ...args], { cwd: ROOT, stdio: 'inherit' })
