import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

/**
 * .tgz 書き出しのオプション。
 * name/version は編集 UI の入力欄から受け取り（生成 package.json は `@slides/{name}`）、
 * baseDir は相対アセット（image/ voice/ theme/ font/）の収集元ディレクトリ（読込中パッケージの baseDir）。
 */
export interface ExportOptions {
  /** 出力先ディレクトリ（dialog で選択） */
  outDir: string
  /** パッケージ名（`@slides/{name}` として生成） */
  name: string
  /** バージョン（デフォルト 1.0.0 を UI 側で補完） */
  version: string
  /** 相対アセットの収集元。未指定なら収集をスキップ */
  baseDir?: string
  /** 同梱するアドオン（層B・個別選択）。未指定なら同梱しない */
  includedAddons?: string[]
}

/**
 * 編集モード state を有効化する（Rust 側の書き込みゲートを開ける）。
 * 失敗しても UI 遷移をブロックしないよう、呼び出し側で try/catch する方針（A-005）。
 */
export async function enterEditMode(): Promise<void> {
  await invoke('set_edit_mode', { enabled: true })
}

/** 編集モード state を無効化する（以降は書き込み不可に戻す）。 */
export async function exitEditMode(): Promise<void> {
  await invoke('set_edit_mode', { enabled: false })
}

/**
 * 編集した slides.json をローカル保存する（Rust コマンド境界・編集モードゲート）。
 * 編集モードが無効なら Rust 側で Err となり reject される（NFR-003）。
 */
export async function saveSlidesJson(path: string, json: string): Promise<void> {
  await invoke('save_slides_json', { path, json })
}

/**
 * 編集した slides.json をアセットとともに .tgz パッケージへ書き出す（編集モード時のみ成功）。
 * 生成された .tgz のパスを返す。JS の camelCase 引数は Tauri が Rust の snake_case へ変換する
 * （既存 `invoke('extract_slide_package', { tgzPath })` と同規約）。
 */
export async function exportSlidePackage(json: string, options: ExportOptions): Promise<string> {
  return invoke<string>('export_slide_package', {
    json,
    outDir: options.outDir,
    baseDir: options.baseDir ?? '',
    name: options.name,
    version: options.version,
    includedAddons: options.includedAddons ?? [],
  })
}

/**
 * 保存先の slides.json パスを選ぶ（save ダイアログ）。キャンセル時は null。
 * 書き込み自体は行わず、パス選択のみ（実書き込みは saveSlidesJson の Rust コマンド）。
 */
export async function chooseSlidesSavePath(defaultPath?: string): Promise<string | null> {
  const selected = await save({
    defaultPath: defaultPath ?? 'slides.json',
    filters: [{ name: 'Slides JSON', extensions: ['json'] }],
  })
  return selected ?? null
}

/** .tgz の出力先ディレクトリを選ぶ（ディレクトリ選択ダイアログ）。キャンセル時は null。 */
export async function chooseExportDir(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  return typeof selected === 'string' ? selected : null
}

/** 組み込みアドオン（addons/src）の一覧を取得する（層A・dev 限定。release では空配列）。 */
export async function listBuiltinAddons(): Promise<string[]> {
  return invoke<string[]>('list_builtin_addons')
}

/** 組み込みアドオンを新規作成する（層A・dev 限定＋編集モード）。反映には npm run build:addons の再ビルドが必要。 */
export async function addBuiltinAddon(name: string): Promise<void> {
  await invoke('add_builtin_addon', { name })
}

/** 組み込みアドオンを削除する（層A・dev 限定＋編集モード）。反映には再ビルドが必要。 */
export async function removeBuiltinAddon(name: string): Promise<void> {
  await invoke('remove_builtin_addon', { name })
}
