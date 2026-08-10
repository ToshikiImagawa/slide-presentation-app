import { getVersion } from '@tauri-apps/api/app'
import samplesManifest from '../samples/manifest.json'
import { validatePresentationData } from './data'
import type { PresentationData } from './data'
import type { SlidePackageDownloadOptions } from './localSlideLoader'

/**
 * ホーム画面の「サンプルを開く」で表示する配布サンプル（テンプレートガイド）の取得先。
 * サンプルはアプリに同梱せず GitHub Releases のアセット（.spkg）として配布するため、
 * 取得元の決定・URL 組み立て・同梱 slides.json の判定をここに集約する（main.tsx はテストから import できない）。
 */

const REPO = 'ToshikiImagawa/slide-presentation-app'

/**
 * サンプル取得のタイムアウト。共有クライアントの既定は 300 秒だが、
 * ホーム画面は読み込み中に全ボタンが無効化されるため、待たせ続けずフォールバックへ進む
 */
const SAMPLE_DOWNLOAD_TIMEOUT_SECS = 30

/**
 * ロケールに対応するサンプルパッケージ名を samples/manifest.json から解決する（純粋関数）。
 * 言語コード（ja-JP → ja）で照合し、サンプルが無いロケールは fallbackLocale を使う
 */
export function resolveSamplePackageName(locale: string): string {
  const lang = locale.split('-')[0].toLowerCase()
  const { packages, fallbackLocale } = samplesManifest
  const found = packages.find((p) => p.locale === lang) ?? packages.find((p) => p.locale === fallbackLocale)
  // manifest の整合性（fallbackLocale が packages に存在すること）は scripts/__tests__/export-samples.test.mjs が担保する
  return (found ?? packages[0]).name
}

/** サンプルパッケージの取得元 1 件 */
export interface SampleSource {
  url: string
  download: SlidePackageDownloadOptions
}

/** アプリのバージョン（tauri.conf.json 由来 = 実際に動いているバイナリの版）。素のブラウザなど取得できない環境では null */
async function getAppVersion(): Promise<string | null> {
  try {
    return await getVersion()
  } catch {
    // Tauri IPC が無い環境（素のブラウザ）ではバージョンを特定できない
    return null
  }
}

/**
 * 配布サンプルの取得元を優先順に返す（先頭から順に試し、取得できたものを使う）。
 *
 * 1. このアプリのバージョンのタグに添付されたアセット — その版が解釈できる内容が保証される。
 *    内容が変わらない URL なのでキャッシュを再利用でき、2 回目以降はオフラインでも開ける
 * 2. latest のアセット — 1 が存在しないとき（タグ未公開のローカルビルド等）の保険。
 *    内容が変わりうるためキャッシュは再利用しない
 *
 * VITE_SAMPLE_PACKAGE_URL を指定した場合はそれだけを使う（未公開バージョンでの検証・独自サンプルへの差し替え用）。
 */
export async function getSampleSources(locale: string): Promise<SampleSource[]> {
  const name = resolveSamplePackageName(locale)
  const override = import.meta.env.VITE_SAMPLE_PACKAGE_URL
  if (override) return [{ url: override, download: { timeoutSecs: SAMPLE_DOWNLOAD_TIMEOUT_SECS } }]

  const latest: SampleSource = {
    url: `https://github.com/${REPO}/releases/latest/download/${name}.spkg`,
    download: { timeoutSecs: SAMPLE_DOWNLOAD_TIMEOUT_SECS },
  }

  const version = await getAppVersion()
  if (!version) return [latest]

  return [
    {
      url: `https://github.com/${REPO}/releases/download/v${version}/${name}.spkg`,
      download: { timeoutSecs: SAMPLE_DOWNLOAD_TIMEOUT_SECS, reuseCache: true, cacheKey: `sample-${name}-${version}` },
    },
    latest,
  ]
}

/**
 * 取得先にアプリの表示言語を明示するクエリを付ける（純粋関数）。
 *
 * 同梱 slides.json は単一ファイルなのでクエリは無視されるが、ロケール別に出し分ける配信元
 * （dev サーバーの devSampleSlidesPlugin・screenshot モードの screenshotFixturePlugin。vite.config.ts）は
 * これが無いと Accept-Language（= OS/ブラウザの言語）しか手掛かりが無く、アプリ内で選んだ言語を無視してしまう。
 */
export function withLocaleQuery(path: string, locale: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`
}

/**
 * ビルド時に同梱された slides.json を読む（VITE_SLIDE_PACKAGE による同梱・スクリーンショット用 fixture・dev の samples 配信）。
 *
 * Vite の dev サーバーは存在しないパスにも SPA フォールバックで 200 + index.html を返すため、
 * res.ok だけでは判定できない。content-type とスキーマの両方を検証してから採用する。
 * VITE_SAMPLE_SOURCE=remote を指定すると同梱を無視し、リモート取得の経路を実機で確認できる。
 *
 * locale は (2) のリモート取得（getSampleSources）と同じく**アプリ内で選択中の言語**を渡す。
 * 取得先がロケール別に出し分ける配信元の場合に効く（withLocaleQuery）。
 */
export async function loadBundledSampleSlides(locale: string): Promise<PresentationData | null> {
  if (import.meta.env.VITE_SAMPLE_SOURCE === 'remote') return null
  try {
    const res = await fetch(withLocaleQuery(import.meta.env.VITE_SLIDES_PATH || '/slides.json', locale))
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null
    const parsed: unknown = await res.json()
    if (!validatePresentationData(parsed)) {
      console.error('[sampleSlides] 同梱 slides.json の形式が正しくありません')
      return null
    }
    return parsed
  } catch {
    // 未同梱（404）・JSON でない・ネットワーク断はいずれも「同梱なし」として扱う
    return null
  }
}
