#!/usr/bin/env node

/**
 * `tauri build` のラッパー。
 *
 * tauri.conf.json は bundle.createUpdaterArtifacts: true を既定にしているが、
 * Tauri v2 は pubkey 設定済みかつ署名鍵未設定だとビルドが失敗する
 * （"A public key has been found, but no private key"）。
 * TAURI_SIGNING_PRIVATE_KEY が無いローカル開発ビルドでは createUpdaterArtifacts を無効化し、
 * 署名鍵を注入できる CI/リリースビルドでのみ updater アーティファクトを生成する。
 */
import { execFileSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname

const hasSigningKey = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY)

const args = ['tauri', 'build']
if (!hasSigningKey) {
  console.log('TAURI_SIGNING_PRIVATE_KEY が未設定のため createUpdaterArtifacts を無効化します')
  args.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }))
}

execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' })
