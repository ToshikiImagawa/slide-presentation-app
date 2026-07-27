import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { dirname } from '@tauri-apps/api/path'
import { LazyStore } from '@tauri-apps/plugin-store'
import { validatePresentationData } from './data'
import type { PresentationData } from './data'
import { SLIDE_PACKAGE_ARCHIVE_EXTENSIONS, isSlidePackageArchivePath } from './slidePackageArchive'

const ASSET_PATH_PREFIXES = ['image/', 'voice/', 'theme/', 'font/']
const RECENT_PACKAGES_KEY = 'recentSlidePackages'
const MAX_RECENT_PACKAGES = 8
/** 同梱アドオンの信頼判断（path → 許可/拒否）の永続化キー */
const ADDON_TRUST_KEY = 'addonTrust'
/** 同梱アドオンを一律無効化するグローバル設定の永続化キー */
const ADDON_DISABLE_KEY = 'disableEmbeddedAddons'

const slidePackageStore = new LazyStore('slide-package-state.json')

export interface LoadedSlidePackage {
  data: PresentationData
  /** 書換前の元 slides.json テキスト（編集モードの無損失往復の土台）。相対アセットパスを保持する */
  rawText: string
  baseDir: string
  /** 利用者が選択した元パス（.spkg/.tgz または slides.json）。信頼判断の永続化キーに使う */
  sourcePath: string
  /** convertFileSrc で asset URL 化済みのアドオンバンドル URL（manifest 宣言かつ addons/ 配下のみ） */
  addonScripts: string[]
  /** package.json 由来の書き出し用 name/version。編集モードの初期値に使う（無ければ両フィールド null） */
  identity: SlidePackageIdentity
  /** アドオン登録の所有者スコープ（= baseDir）。パッケージ切替時の owner 単位アンロードに使用する */
  owner: string
}

/** アドオン manifest の最小形（bundle のみ参照する） */
interface PackageAddonManifest {
  addons?: Array<{ bundle?: unknown }>
}

/**
 * パッケージ同梱アドオンの manifest から、baseDir/addons/ 配下のバンドル相対パスのみを取り出す（純粋関数）。
 * スコープ外パス（addons/ 以外）は除外する（FR-010）。bundle の先頭スラッシュは正規化する。
 */
export function extractAddonBundlePaths(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return []
  const addons = (manifest as PackageAddonManifest).addons
  if (!Array.isArray(addons)) return []
  return addons.map((a) => (a && typeof a.bundle === 'string' ? a.bundle.replace(/^\//, '') : null)).filter((b): b is string => b !== null && b.startsWith('addons/'))
}

/** path 単位の同梱アドオン信頼判断 */
export type AddonTrustDecision = 'allowed' | 'denied'
export type AddonTrustMap = Record<string, AddonTrustDecision>

/**
 * グローバル無効化フラグと path 単位の判断から、アドオンをどう扱うか決める（純粋関数）。
 * - 一律無効化が ON → 'deny'
 * - 許可/拒否が永続化済み → その判断
 * - 未判断 → 'prompt'（呼び出し側が確認ダイアログを出す。既定は拒否）
 */
export function resolveAddonTrust(disabled: boolean, decision: AddonTrustDecision | undefined): 'allow' | 'deny' | 'prompt' {
  if (disabled) return 'deny'
  if (decision === 'allowed') return 'allow'
  if (decision === 'denied') return 'deny'
  return 'prompt'
}

/** 同梱アドオンが一律無効化されているかを取得する */
export async function isEmbeddedAddonsDisabled(): Promise<boolean> {
  return (await slidePackageStore.get<boolean>(ADDON_DISABLE_KEY)) ?? false
}

/** 同梱アドオンの一律無効化フラグを設定する */
export async function setEmbeddedAddonsDisabled(disabled: boolean): Promise<void> {
  await slidePackageStore.set(ADDON_DISABLE_KEY, disabled)
  await slidePackageStore.save()
}

/**
 * 同梱アドオン信頼マップ（ADDON_TRUST_KEY）への read-modify-write を直列化するキュー。
 * 個別 allow/deny・未設定戻し・リセットが短時間に連続しても、各操作が最新のマップを読んでから
 * 更新するため別 path の判断が失われない（fire-and-forget による取りこぼしを防ぐ）。
 */
let trustWriteChain: Promise<void> = Promise.resolve()
function queueTrustWrite(mutate: (map: AddonTrustMap) => void): Promise<void> {
  const run = trustWriteChain.then(async () => {
    const trustMap = (await slidePackageStore.get<AddonTrustMap>(ADDON_TRUST_KEY)) ?? {}
    mutate(trustMap)
    await slidePackageStore.set(ADDON_TRUST_KEY, trustMap)
    await slidePackageStore.save()
  })
  // 1件の失敗で後続まで詰まらないよう、チェーンには握りつぶした派生を繋ぐ（呼び出し側には実 promise を返す）
  trustWriteChain = run.catch(() => {})
  return run
}

/** 許可済み/拒否済みの信頼判断をすべて失効（リセット）する */
export async function resetAddonTrust(): Promise<void> {
  await queueTrustWrite((map) => {
    for (const key of Object.keys(map)) delete map[key]
  })
}

/**
 * 指定 path のパッケージの同梱アドオンをロードしてよいか判定する。
 * 未判断の場合は確認ダイアログ（既定拒否）を表示し、その結果を path 単位で永続化する（FR-008/009）。
 */
export async function isAddonAllowed(path: string): Promise<boolean> {
  const disabled = await isEmbeddedAddonsDisabled()
  const trustMap = (await slidePackageStore.get<AddonTrustMap>(ADDON_TRUST_KEY)) ?? {}
  const outcome = resolveAddonTrust(disabled, trustMap[path])
  if (outcome === 'allow') return true
  if (outcome === 'deny') return false

  // 未判断 → 確認ダイアログ（既定は「無効のまま」＝拒否）
  const allowed = await ask('このパッケージは実行コード（アドオン）を含みます。\n信頼できる発行元の場合のみ有効化してください。', {
    title: '同梱アドオンの確認',
    kind: 'warning',
    okLabel: '有効化する',
    cancelLabel: '無効のまま',
  })
  await queueTrustWrite((map) => {
    map[path] = allowed ? 'allowed' : 'denied'
  })
  return allowed
}

/** 同梱アドオンの信頼判断マップ（sourcePath → allowed/denied）を取得する（層C の個別付け外し UI 表示用） */
export async function getAddonTrustMap(): Promise<AddonTrustMap> {
  return (await slidePackageStore.get<AddonTrustMap>(ADDON_TRUST_KEY)) ?? {}
}

/**
 * 指定 path の同梱アドオン信頼を個別に許可/拒否する（層C・FR-008）。
 * 既存マップを読み、対象 path のみ更新して保存する（他パッケージの判断を消さない read-modify-write）。
 * グローバル無効化（disableEmbeddedAddons）が個別判断より優先される点は resolveAddonTrust の通り。
 */
export async function setAddonTrustDecision(path: string, decision: AddonTrustDecision): Promise<void> {
  await queueTrustWrite((map) => {
    map[path] = decision
  })
}

/**
 * 指定 path の同梱アドオン信頼判断を「未設定」に戻す（層C・FR-008）。trustMap からキーを削除するため、
 * 次回そのパッケージを開くと再び確認ダイアログ（既定拒否）が表示される。
 */
export async function clearAddonTrustDecision(path: string): Promise<void> {
  await queueTrustWrite((map) => {
    delete map[path]
  })
}

/** baseDir/addons/manifest.json から同梱アドオンの name 一覧を取得する（層B の export 個別選択 UI 用）。無い/不正なら空配列 */
export async function getPackageAddonNames(baseDir: string): Promise<string[]> {
  if (!baseDir) return []
  try {
    const raw = await readTextFile(`${baseDir}/addons/manifest.json`)
    const manifest: unknown = JSON.parse(raw)
    const addons = (manifest as { addons?: Array<{ name?: unknown }> }).addons
    if (!Array.isArray(addons)) return []
    return addons.map((a) => (a && typeof a.name === 'string' ? a.name : null)).filter((n): n is string => n !== null)
  } catch {
    // manifest が存在しない・不正な場合はアドオンなし
    return []
  }
}

/** パッケージの package.json 由来の書き出し用の識別情報。読めない・欠落・型不一致のフィールドは null */
export interface SlidePackageIdentity {
  /** スコープを除いたパッケージ名（@slides/foo → foo）。UI・書き出しは @slides/{name} 固定表記なので name 部分だけを扱う */
  name: string | null
  version: string | null
}

/** package.json が無い・読めない場合の identity（呼び出し側は meta.title からの自動生成にフォールバックする） */
const NO_PACKAGE_IDENTITY: SlidePackageIdentity = { name: null, version: null }

/**
 * package.json テキストから書き出し用の name / version を取り出す（純粋関数）。JSON が不正・オブジェクトでない・
 * フィールドが欠落/型不一致なら該当フィールドは null。値の妥当性は検証しない（CLI 書き出しは name を無検証で
 * 通すため、既存パッケージには GUI の検証規則に反する name が実在する。そのまま返し、UI 側の検証でユーザーに
 * 提示して修正させる）
 */
export function parsePackageIdentity(raw: string): SlidePackageIdentity {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NO_PACKAGE_IDENTITY
  }
  if (typeof parsed !== 'object' || parsed === null) return NO_PACKAGE_IDENTITY
  const { name, version } = parsed as { name?: unknown; version?: unknown }
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedVersion = typeof version === 'string' ? version.trim() : ''
  return {
    // スコープを除く（@slides/foo → foo）
    name: trimmedName === '' ? null : trimmedName.replace(/^@[^/]*\//, ''),
    version: trimmedVersion === '' ? null : trimmedVersion,
  }
}

/** baseDir/package.json から書き出し用の name / version を取得する（編集モードの初期値に使う）。
 * package.json が無い（slides.json 単体を開いた場合など）・読めない場合は両フィールド null */
async function getPackageIdentity(baseDir: string): Promise<SlidePackageIdentity> {
  try {
    return parsePackageIdentity(await readTextFile(`${baseDir}/package.json`))
  } catch {
    return NO_PACKAGE_IDENTITY
  }
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

/** JSON内の image/voice/theme/font 参照を baseDir 基準のローカル asset URL に書き換える（scripts/export-slides.mjs の extractAssetPaths と同じ規則）。編集モードのプレビュー表示でも再利用する（DC-003 単一真実源） */
export function resolveLocalAssetPaths<T>(value: T, baseDir: string): T {
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

/** https の URL かどうかを判定する（純粋関数。issue #40: ダウンロード対象を https スキームのみに限定する） */
function isRemoteUrl(path: string): boolean {
  return /^https:\/\//i.test(path)
}

/** 選択されたパスから slides.json の実パスとその基準ディレクトリを求める（.spkg/.tgz・URL は Rust 側でダウンロード/展開） */
async function resolvePackageEntry(selectedPath: string): Promise<{ slidesJsonPath: string; baseDir: string }> {
  if (isRemoteUrl(selectedPath)) {
    const extractedDir = await invoke<string>('download_slide_package', { url: selectedPath })
    return { slidesJsonPath: `${extractedDir}/slides.json`, baseDir: extractedDir }
  }
  if (isSlidePackageArchivePath(selectedPath)) {
    const extractedDir = await invoke<string>('extract_slide_package', { packagePath: selectedPath })
    return { slidesJsonPath: `${extractedDir}/slides.json`, baseDir: extractedDir }
  }
  return { slidesJsonPath: selectedPath, baseDir: await dirname(selectedPath) }
}

/** baseDir/addons/manifest.json を読み、宣言されたバンドルを asset URL 化して返す。manifest 不在・不正時は空配列 */
async function resolvePackageAddons(baseDir: string): Promise<string[]> {
  try {
    const raw = await readTextFile(`${baseDir}/addons/manifest.json`)
    const manifest: unknown = JSON.parse(raw)
    return extractAddonBundlePaths(manifest).map((bundle) => convertFileSrc(`${baseDir}/${bundle}`))
  } catch {
    // manifest が存在しない・不正な場合はアドオンなし（スライド自体は開ける）
    return []
  }
}

/** 指定パス（slides.json または .spkg/.tgz パッケージ）を読み込み、バリデーション・ローカルアセット解決を行う。失敗時は例外を投げる */
async function loadSlidePackage(selectedPath: string): Promise<LoadedSlidePackage> {
  const { slidesJsonPath, baseDir } = await resolvePackageEntry(selectedPath)

  // asset プロトコル・fs プラグイン双方にこのディレクトリの読み取りを許可する（readTextFile より先に必要）
  await invoke('allow_asset_dir', { dir: baseDir })

  const raw = await readTextFile(slidesJsonPath)
  const parsed: unknown = JSON.parse(raw)
  if (!validatePresentationData(parsed)) {
    throw new Error('スライドデータの形式が正しくありません（meta.title、slides 配列などを確認してください）')
  }

  // allow_asset_dir 完了後に同梱アドオンと書き出し用 identity を解決する（互いに独立した読み取りなので並列）。
  // owner はパッケージ単位で一意な baseDir
  const [addonScripts, identity] = await Promise.all([resolvePackageAddons(baseDir), getPackageIdentity(baseDir)])

  return { data: resolveLocalAssetPaths(parsed, baseDir), rawText: raw, baseDir, sourcePath: selectedPath, addonScripts, identity, owner: baseDir }
}

/** 最近使ったリストを取得する */
export async function getRecentSlidePackages(): Promise<RecentSlidePackageEntry[]> {
  return (await slidePackageStore.get<RecentSlidePackageEntry[]>(RECENT_PACKAGES_KEY)) ?? []
}

/** 最近使ったリストから指定 path のエントリを取り除いて保存し、更新後のリストを返す（読み込み失敗時の自動除去・ホーム画面の個別削除UI両方から使う） */
export async function removeRecentSlidePackage(path: string): Promise<RecentSlidePackageEntry[]> {
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

/** 指定パスを読み込み、成功時は最近使ったリストに記録する。失敗時はエラーダイアログを表示する（recentPackages は変更なしの null） */
async function loadAndRecordSlidePackage(selectedPath: string): Promise<SlidePackageLoadResult> {
  try {
    const result = await loadSlidePackage(selectedPath)
    const recentPackages = await recordRecentSlidePackage(selectedPath, result.data.meta.title)
    return { data: result, recentPackages }
  } catch (error) {
    await reportLoadError(error)
    return { data: null, recentPackages: null }
  }
}

/** ダイアログでローカルの slides.json または .spkg パッケージ（旧 .tgz も対応）を選択して読み込む。成功時は最近使ったリストに記録し、失敗時はエラーダイアログを表示する */
export async function pickAndLoadSlidePackage(): Promise<SlidePackageLoadResult> {
  const selected = await open({
    title: 'スライドを開く',
    filters: [
      { name: 'slides.json', extensions: ['json'] },
      { name: 'スライドパッケージ (.spkg / .tgz)', extensions: SLIDE_PACKAGE_ARCHIVE_EXTENSIONS.map((ext) => ext.replace(/^\./, '')) },
    ],
    multiple: false,
    directory: false,
  })
  // キャンセル時は最近使ったリストを変更しないため recentPackages は null（再設定不要）
  if (!selected || Array.isArray(selected)) return { data: null, recentPackages: null }
  return loadAndRecordSlidePackage(selected)
}

/** 指定 URL のスライドパッケージ（.spkg/.tgz）をダウンロードして読み込む（issue #40）。成功時は最近使ったリストに記録し、失敗時はエラーダイアログを表示する */
export async function loadSlidePackageFromUrl(url: string): Promise<SlidePackageLoadResult> {
  return loadAndRecordSlidePackage(url)
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
