import { message, open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { dirname } from '@tauri-apps/api/path'
import { LazyStore } from '@tauri-apps/plugin-store'
import { validatePresentationData } from './data'
import type { PresentationData } from './data'

const ASSET_PATH_PREFIXES = ['image/', 'voice/', 'theme/', 'font/']
const LAST_PACKAGE_PATH_KEY = 'lastSlidePackagePath'

const slidePackageStore = new LazyStore('slide-package-state.json')

export interface LoadedSlidePackage {
  data: PresentationData
  baseDir: string
}

/** JSON内の image/voice/theme/font 参照を baseDir 基準のローカル asset URL に書き換える（scripts/export-slides.mjs の extractAssetPaths と同じ規則） */
function resolveLocalAssetPaths<T>(value: T, baseDir: string): T {
  if (typeof value === 'string') {
    const normalized = value.replace(/^\//, '')
    if (ASSET_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return convertFileSrc(`${baseDir}/${normalized}`) as unknown as T
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveLocalAssetPaths(item, baseDir)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveLocalAssetPaths(v, baseDir)
    }
    return result as T
  }
  return value
}

/** 選択されたパスから slides.json の実パスとその基準ディレクトリを求める（.tgz は Rust 側で展開） */
async function resolvePackageEntry(selectedPath: string): Promise<{ slidesJsonPath: string; baseDir: string }> {
  if (selectedPath.toLowerCase().endsWith('.tgz')) {
    const extractedDir = await invoke<string>('extract_slide_package', { tgzPath: selectedPath })
    return { slidesJsonPath: `${extractedDir}/slides.json`, baseDir: extractedDir }
  }
  return { slidesJsonPath: selectedPath, baseDir: await dirname(selectedPath) }
}

/** 指定パス（slides.json または .tgz パッケージ）を読み込み、バリデーション・ローカルアセット解決を行う。失敗時は例外を投げる */
async function loadSlidePackage(selectedPath: string): Promise<LoadedSlidePackage> {
  const { slidesJsonPath, baseDir } = await resolvePackageEntry(selectedPath)

  // asset プロトコル・fs プラグイン双方にこのディレクトリの読み取りを許可する（readTextFile より先に必要）
  await invoke('allow_asset_dir', { dir: baseDir })

  const raw = await readTextFile(slidesJsonPath)
  const parsed: unknown = JSON.parse(raw)
  if (!validatePresentationData(parsed)) {
    throw new Error('スライドデータの形式が正しくありません（meta.title、slides 配列などを確認してください）')
  }

  return { data: resolveLocalAssetPaths(parsed, baseDir), baseDir }
}

/** 指定パスのスライドパッケージを読み込む。失敗時は null（起動時の自動復元など、ユーザーへのエラー表示が不要な場合に使用） */
export async function loadSlidePackageFromPath(selectedPath: string): Promise<LoadedSlidePackage | null> {
  try {
    return await loadSlidePackage(selectedPath)
  } catch (error) {
    console.error('[localSlideLoader] スライドの読み込みに失敗しました', error)
    return null
  }
}

/** ダイアログでローカルの slides.json または .tgz パッケージを選択して読み込む。成功時は次回起動用にパスを記憶し、失敗時はエラーダイアログを表示する */
export async function pickAndLoadSlidePackage(): Promise<LoadedSlidePackage | null> {
  const selected = await open({
    title: 'スライドを開く',
    filters: [
      { name: 'slides.json', extensions: ['json'] },
      { name: 'スライドパッケージ (.tgz)', extensions: ['tgz'] },
    ],
    multiple: false,
    directory: false,
  })
  if (!selected || Array.isArray(selected)) return null

  try {
    const result = await loadSlidePackage(selected)
    await slidePackageStore.set(LAST_PACKAGE_PATH_KEY, selected)
    await slidePackageStore.save()
    return result
  } catch (error) {
    console.error('[localSlideLoader] スライドの読み込みに失敗しました', error)
    const detail = error instanceof Error ? error.message : String(error)
    await message(`スライドの読み込みに失敗しました。\n\n${detail}`, { title: 'スライドを開く', kind: 'error' })
    return null
  }
}

/** 前回開いていたローカルスライドパッケージを復元する（存在しない・読み込み失敗時は null） */
export async function loadLastSlidePackage(): Promise<LoadedSlidePackage | null> {
  const lastPath = await slidePackageStore.get<string>(LAST_PACKAGE_PATH_KEY)
  if (!lastPath) return null
  return loadSlidePackageFromPath(lastPath)
}
