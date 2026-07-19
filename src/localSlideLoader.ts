import { message, open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { dirname } from '@tauri-apps/api/path'
import { LazyStore } from '@tauri-apps/plugin-store'
import { validatePresentationData } from './data'
import type { PresentationData } from './data'

const ASSET_PATH_PREFIXES = ['image/', 'voice/', 'theme/', 'font/']
const RECENT_PACKAGES_KEY = 'recentSlidePackages'
const MAX_RECENT_PACKAGES = 8

const slidePackageStore = new LazyStore('slide-package-state.json')

export interface LoadedSlidePackage {
  data: PresentationData
  baseDir: string
}

/** スライド読み込みの結果と、それに伴う最近使ったリストの更新をまとめて返す（recentPackages が null のときは変更なし＝再設定不要） */
export interface SlidePackageLoadResult {
  data: LoadedSlidePackage | null
  recentPackages: RecentSlidePackageEntry[] | null
}

/** ホーム画面の「最近開いたスライド」一覧に表示する1件分の情報 */
export interface RecentSlidePackageEntry {
  path: string
  title: string
  openedAt: number
}

/** 最近使ったリストに entry を追加する（同一 path は重複排除して先頭へ、上限 max 件） */
export function upsertRecentEntry(list: RecentSlidePackageEntry[], entry: RecentSlidePackageEntry, max = MAX_RECENT_PACKAGES): RecentSlidePackageEntry[] {
  const withoutDup = list.filter((item) => item.path !== entry.path)
  return [entry, ...withoutDup].slice(0, max)
}

/** 最近使ったリストから指定 path のエントリを取り除く */
export function removeRecentEntry(list: RecentSlidePackageEntry[], path: string): RecentSlidePackageEntry[] {
  return list.filter((item) => item.path !== path)
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

/** 最近使ったリストを取得する */
export async function getRecentSlidePackages(): Promise<RecentSlidePackageEntry[]> {
  return (await slidePackageStore.get<RecentSlidePackageEntry[]>(RECENT_PACKAGES_KEY)) ?? []
}

/** 最近使ったリストから指定 path のエントリを取り除いて保存し、更新後のリストを返す（ファイルが移動・削除された場合など） */
async function removeRecentSlidePackage(path: string): Promise<RecentSlidePackageEntry[]> {
  const list = await getRecentSlidePackages()
  const updated = removeRecentEntry(list, path)
  await slidePackageStore.set(RECENT_PACKAGES_KEY, updated)
  await slidePackageStore.save()
  return updated
}

/** 読み込みに成功した path を最近使ったリストの先頭に記録し、更新後のリストを返す */
async function recordRecentSlidePackage(path: string, title: string): Promise<RecentSlidePackageEntry[]> {
  const list = await getRecentSlidePackages()
  const updated = upsertRecentEntry(list, { path, title, openedAt: Date.now() })
  await slidePackageStore.set(RECENT_PACKAGES_KEY, updated)
  await slidePackageStore.save()
  return updated
}

/** 読み込みに失敗した場合の共通処理: エラーダイアログを表示する */
async function reportLoadError(error: unknown): Promise<void> {
  console.error('[localSlideLoader] スライドの読み込みに失敗しました', error)
  const detail = error instanceof Error ? error.message : String(error)
  await message(`スライドの読み込みに失敗しました。\n\n${detail}`, { title: 'スライドを開く', kind: 'error' })
}

/** ダイアログでローカルの slides.json または .tgz パッケージを選択して読み込む。成功時は最近使ったリストに記録し、失敗時はエラーダイアログを表示する */
export async function pickAndLoadSlidePackage(): Promise<SlidePackageLoadResult> {
  const selected = await open({
    title: 'スライドを開く',
    filters: [
      { name: 'slides.json', extensions: ['json'] },
      { name: 'スライドパッケージ (.tgz)', extensions: ['tgz'] },
    ],
    multiple: false,
    directory: false,
  })
  // キャンセル時・読み込み失敗時は最近使ったリストを変更しないため recentPackages は null（再設定不要）
  if (!selected || Array.isArray(selected)) return { data: null, recentPackages: null }

  try {
    const result = await loadSlidePackage(selected)
    const recentPackages = await recordRecentSlidePackage(selected, result.data.meta.title)
    return { data: result, recentPackages }
  } catch (error) {
    await reportLoadError(error)
    return { data: null, recentPackages: null }
  }
}

/** 最近使ったリストの1件を再読み込みする。成功時はリスト先頭に更新し、失敗時はエラーダイアログを表示してリストから取り除く */
export async function openRecentSlidePackage(path: string): Promise<SlidePackageLoadResult> {
  try {
    const result = await loadSlidePackage(path)
    const recentPackages = await recordRecentSlidePackage(path, result.data.meta.title)
    return { data: result, recentPackages }
  } catch (error) {
    await reportLoadError(error)
    // 読み込めなかったエントリはリストから取り除き、更新後のリストを返して一覧から消えるようにする
    const recentPackages = await removeRecentSlidePackage(path)
    return { data: null, recentPackages }
  }
}
