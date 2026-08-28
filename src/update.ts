import { invoke } from '@tauri-apps/api/core'

/**
 * 自動アップデート（#121）。endpoints は GitHub API 経由で動的に解決する必要があるため、
 * `@tauri-apps/plugin-updater` の JS API（静的 config の endpoints しか使えない）は使わず、
 * Rust コマンド（`src-tauri/src/update_check.rs`）を薄く呼ぶだけにする。
 */

export interface UpdateInfo {
  version: string
  currentVersion: string
  body: string | null
}

/**
 * 更新の有無を確認する。オフライン・GitHub API のレート制限・latest.json 未添付などは
 * すべて reject される。呼び出し側は無言で諦める（利用を妨げない）
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>('check_for_update')
}

/**
 * 設定画面の「更新を確認」ボタンから呼ぶ手動確認。ユーザーの明示操作のため、起動時チェックの
 * クールダウン・devガードの対象外（`check_for_update_manual`。`src-tauri/src/update_check.rs`）
 */
export async function checkForUpdateManual(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>('check_for_update_manual')
}

/** 確認済みの更新をダウンロード・インストールし、アプリを再起動する（成功時は戻ってこない） */
export async function installUpdate(): Promise<void> {
  await invoke('install_update')
}
