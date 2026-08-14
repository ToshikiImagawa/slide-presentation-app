import { invoke } from '@tauri-apps/api/core'
import type { ValidationError } from './data/types'
import { parseSlides } from './edit/slidesSerialize'
import { getSchemaConformanceErrors } from './data/slideContentSchema'
import { FONT_SLOT_CSS_VARS, getThemeWarnings, THEME_COLOR_TOKENS } from './applyTheme'
import { getRegisteredComponents } from './components/ComponentRegistry'

/**
 * AI スライド生成の契約型＋invoke ラッパ＆オーケストレータ（#14）。
 *
 * 生成・キー管理コマンドの呼び出し口（`editModeSave.ts` と同じ camelCase→snake_case 規約）と、
 * 自動修正ループを JS 側で駆動するオーケストレータ `generateSlides` を提供する。
 * Rust の `generate_slides` は候補 1 件を返すのみで、検証（`getValidationErrors`）・
 * 自動修正の再投入・`GenerateResult` 組立・進捗通知は本ファイルが単一真実源として担う（design §4.1／§9.1）。
 */

/**
 * 生成種別。内蔵（Vertex AI 直）と外部（Claude Code CLI）を切り替える（FR-002）。
 * Rust の `SlideGeneratorKind` と同一のワイヤー値（kebab-case 文字列）。
 */
export type GeneratorKind = 'builtin-vertex' | 'external-claude-code'

/**
 * 入力プロンプトの意味論（#302）。`prompt` が「新規スライドの内容そのもの」なのか
 * 「既存スライドへの変更依頼（差分指示）」なのかをAIが取り違えやすいため、UI で選択させ
 * Rust 側 `user_prompt()` に明示ラベルを付与させる。Rust の `PromptIntent` と同一のワイヤー値。
 */
export type PromptIntent = 'new-content' | 'change-instruction'

/**
 * 生成リクエスト。Rust の `GenerateRequest`（camelCase）とワイヤーフォーマットを一致させる。
 */
export interface GenerateRequest {
  /** 生成プロンプト */
  prompt: string
  /** 生成種別（内蔵/外部） */
  kind: GeneratorKind
  /** 編集起点で生成する場合の現行 slides.json（新規生成時は省略。NFR-004 の送出対象） */
  baseSlides?: string
  /** 自動修正の再試行時に JS オーケストレータが積む検証エラー要約（初回は省略。FR-005） */
  repairFeedback?: string
  /** `prompt` が新規内容か変更指示かの明示（#302） */
  promptIntent?: PromptIntent
}

/** 生成結果の最終状態（FR-005）。 */
export type GenerateOutcome = 'succeeded' | 'exhausted' | 'cancelled' | 'failed'

/**
 * `generateSlides()`（JS オーケストレータ）の戻り値。
 * Rust の `generate_slides`（候補 1 件）を上限 N 回まで呼び、`getValidationErrors` で
 * 検証・自動修正した最終結果を組み立てる（FR-005）。
 */
export interface GenerateResult {
  outcome: GenerateOutcome
  /** 候補 slides.json 文字列。succeeded / exhausted で非 null、cancelled / failed で null */
  slidesJson: string | null
  /** 取り込み時バリデーションの残存エラー（exhausted で非空になりうる） */
  validationErrors: ValidationError[]
  /** 自動修正ループの試行回数 */
  attempts: number
  /** failed の失敗理由（Rust 側 `GenerateError` の整形済み文言。秘密は含まない・NFR-004）。failed 以外は null */
  errorMessage: string | null
}

/** `GenerateResult` から取り出す「器へ適用可能な候補」（slidesJson が非 null な succeeded/exhausted のみ）。 */
export interface GeneratedCandidate {
  slidesJson: string
  /** 適用候補に残る検証エラー（exhausted で非空になりうる） */
  validationErrors: ValidationError[]
}

/**
 * `GenerateResult` から適用可能な候補を取り出す。succeeded/exhausted かつ slidesJson 非 null のときのみ返す
 * （cancelled/failed は常に null。invariant を `GenerateResult` の定義箇所に単一集約する）。
 */
export function toGeneratedCandidate(result: GenerateResult): GeneratedCandidate | null {
  if (result.outcome !== 'succeeded' && result.outcome !== 'exhausted') return null
  if (result.slidesJson === null) return null
  return { slidesJson: result.slidesJson, validationErrors: result.validationErrors }
}

/** 生成進捗（FR-010）。JS オーケストレータが試行/フェーズ単位で通知する。 */
export interface GenerateProgress {
  /** 現在の試行回数（1 起点） */
  attempt: number
  /** 自動修正ループの上限 N */
  maxAttempts: number
  /** 現在のフェーズ */
  phase: 'generating' | 'validating' | 'repairing'
}

/** 内蔵（Vertex AI）生成の設定（非秘密。FR-006）。Rust の `VertexConfig` と camelCase で一致。 */
export interface VertexConfig {
  /** GCP プロジェクト ID */
  projectId: string
  /** リージョン（`global` またはリージョン名） */
  region: string
  /** Vertex のモデル ID（`@date` 付き。例 `claude-sonnet-4-5@20250929`） */
  model: string
}

/** 内蔵生成の設定状態（事前ゲート用。生値は返さない）。Rust の `VertexStatus` と一致。 */
export interface VertexStatus {
  /** project/region/model がすべて設定済みか */
  configured: boolean
}

/** 外部生成（Claude Code CLI）へ渡す環境変数 1 件。Rust の `ClaudeCliEnvVar` と camelCase で一致（#152）。 */
export interface ClaudeCliEnvVar {
  key: string
  value: string
}

/**
 * 外部生成（Claude Code CLI）へ渡す環境変数の設定（非秘密。#152）。Rust の `ClaudeCliConfig` と camelCase で一致。
 * GUI 起動の Tauri アプリはシェルプロファイル経由の環境変数（`CLAUDE_CONFIG_DIR` 等）を継承しないことがあるため、
 * ここで設定した値をサブプロセス起動時に明示的に注入する。
 */
export interface ClaudeCliConfig {
  envVars: ClaudeCliEnvVar[]
}

/** 自動修正ループの試行上限 N（NFR-005・design §9.1 で暫定確定＝3）。 */
export const MAX_GENERATE_ATTEMPTS = 3

/**
 * モジュール内の中断要求フラグ。`cancelGenerate()` が立て、`generateSlides()` が試行境界と
 * invoke 失敗時に参照し、`cancelled`（利用者中断）と `failed`（その他エラー）を切り分ける。
 * in-flight の HTTP／サブプロセスの実中断は Rust 側 `cancel_generation` が行う（design §6）。
 */
let cancelRequested = false

/** 生成有効フラグを切り替える（Rust 側ゲート。編集モード必須）。 */
export async function setGenerationEnabled(enabled: boolean): Promise<void> {
  await invoke('set_generation_enabled', { enabled })
}

/** Vertex 設定（project/region/model）を保存する（編集モード必須。非秘密を Rust 境界で plugin-store に保存）。 */
export async function setVertexConfig(config: VertexConfig): Promise<void> {
  await invoke('set_vertex_config', { config })
}

/** Vertex 設定を消去する（編集モード必須）。 */
export async function clearVertexConfig(): Promise<void> {
  await invoke('clear_vertex_config')
}

/** Vertex 設定を取得する（フォームのプリフィル用。未設定は null）。 */
export async function getVertexConfig(): Promise<VertexConfig | null> {
  return invoke<VertexConfig | null>('get_vertex_config')
}

/**
 * 内蔵生成の設定状態のみ取得する（生値は受け取らない）。
 * 事前ゲート表示のため生成無効時でも呼べる（design §5／NFR-003）。
 */
export async function getVertexStatus(): Promise<VertexStatus> {
  return invoke<VertexStatus>('get_vertex_status')
}

/** 外部 CLI（Claude Code CLI）へ渡す環境変数設定を保存する（編集モード必須。非秘密を Rust 境界で plugin-store に保存・#152）。 */
export async function setClaudeCliConfig(config: ClaudeCliConfig): Promise<void> {
  await invoke('set_claude_cli_config', { config })
}

/** 外部 CLI の環境変数設定を消去する（編集モード必須）。 */
export async function clearClaudeCliConfig(): Promise<void> {
  await invoke('clear_claude_cli_config')
}

/** 外部 CLI の環境変数設定を取得する（フォームのプリフィル用。未設定は null）。 */
export async function getClaudeCliConfig(): Promise<ClaudeCliConfig | null> {
  return invoke<ClaudeCliConfig | null>('get_claude_cli_config')
}

/**
 * `gcloud auth application-default login` を起動して GCP ADC を生成する（初回セットアップ・編集モード必須）。
 * 以後の生成は Rust が ADC を読んでトークン交換するため、実行時に gcloud は不要。
 */
export async function gcloudLogin(): Promise<void> {
  await invoke('gcloud_login')
}

/** 外部生成（Claude Code CLI）が利用可能か判定する（事前ゲート・FR-007）。秘密に触れないため常時呼べる。 */
export async function checkExternalAvailable(): Promise<boolean> {
  return invoke<boolean>('check_claude_cli')
}

/** 実行中の生成を中断する。次試行の開始抑止は JS、in-flight の実中断は Rust が担う（FR-010）。 */
export async function cancelGenerate(): Promise<void> {
  cancelRequested = true
  await invoke('cancel_generation')
}

/** ComponentRegistry の登録名一覧を、アイコン名（'Icon:'接頭辞を外す）とコンポーネント名に分離する */
function splitRegisteredNames(names: string[]): { components: string[]; icons: string[] } {
  const ICON_PREFIX = 'Icon:'
  const components: string[] = []
  const icons: string[] = []
  for (const name of names) {
    if (name.startsWith(ICON_PREFIX)) {
      icons.push(name.slice(ICON_PREFIX.length))
    } else {
      components.push(name)
    }
  }
  return { components, icons }
}

/**
 * 適用中テーマ・登録済みコンポーネント/アイコンから AI 生成へ渡す意匠制約テキストを組み立てる（#211）。
 * レイアウト種別・content 構造・情報密度の推奨上限は `schema/slide-content-schema.json`
 * （Rust の `system_prompt` に同梱済み）が単一ソースのため、ここでは実行時にしか分からない値
 * （登録済みコンポーネント/アイコン名・現在の書体）と、全テーマ共通の色トークン名一覧のみを対象にする。
 * 種別・アイコンを追加してもこの関数は変更不要（ComponentRegistry から動的に導出するため）。
 */
export function buildThemeConstraintsPrompt(): string {
  const { components, icons } = splitRegisteredNames(getRegisteredComponents())
  const computed = getComputedStyle(document.documentElement)
  const heading = computed.getPropertyValue(FONT_SLOT_CSS_VARS.heading.family).trim() || '(未設定)'
  const body = computed.getPropertyValue(FONT_SLOT_CSS_VARS.body.family).trim() || '(未設定)'
  return [
    `色トークン名（theme.colors のキー・accentColor・chart系のcolor等で使用可）: ${Object.keys(THEME_COLOR_TOKENS).join(', ')}`,
    `登録済みコンポーネント名（component.name で使用可）: ${components.join(', ') || '(なし)'}`,
    `登録済みアイコン名（tiles[].icon で使用可。'Icon:'接頭辞は付けない）: ${icons.join(', ') || '(なし)'}`,
    `現在の書体: heading=${heading}, body=${body}`,
  ].join('\n')
}

/**
 * 検証エラーを次試行の `repairFeedback` に載せる要約へ整形する（自動修正の再投入・FR-005）。
 * path が空（ルート／JSON 構文エラー）は `(root)` と表示する。
 * `theme` の警告（`getThemeWarnings`）も併記し、描画は継続するが反映されない設定も AI に修正させる。
 */
function summarizeValidationErrors(errors: ValidationError[], themeWarnings: string[]): string {
  const lines = errors.map((e) => `- ${e.path || '(root)'}: ${e.message}（期待: ${e.expected}, 実際: ${e.actual}）`)
  return [...lines, ...themeWarnings.map((w) => `- ${w}`)].join('\n')
}

/**
 * 中断時の結果を組み立てる。failed 同様に候補を返さない（契約: cancelled/failed で slidesJson は null）。
 * 明示中断した検証 NG 候補を器へ流し込まないための安全退避（FR-008）。最良候補 best は exhausted 専用。
 */
function cancelledResult(attempts: number): GenerateResult {
  return { outcome: 'cancelled', slidesJson: null, validationErrors: [], attempts, errorMessage: null }
}

/**
 * 自動修正ループを駆動するオーケストレータ（FR-005／FR-010／NFR-005）。
 *
 * `generate_slides`（Rust・候補 1 件）を上限 `MAX_GENERATE_ATTEMPTS` 回まで呼び、各候補を
 * `parseSlides`（＝`getValidationErrors`。一般用途の構造チェック）と `getSchemaConformanceErrors`
 * （`schema/slide-content-schema.json` を単一ソースとする生成専用の厳格チェック。未知 layout・型不一致を検出）
 * の両方で検証する。妥当なら `succeeded`。不正なら検証エラー要約を
 * 次試行の `repairFeedback` に載せて再投入し、上限到達時は検証エラー最小の最良候補を退避して `exhausted`。
 * invoke が中断要求後に reject したら `cancelled`、その他の失敗は `failed` とする（器の手動編集へ退避・FR-008）。
 *
 * @param onProgress 試行・フェーズ遷移の通知（Tauri event を張らず JS 内コールバックで完結・T-003）
 */
export async function generateSlides(request: GenerateRequest, onProgress?: (p: GenerateProgress) => void): Promise<GenerateResult> {
  cancelRequested = false
  // 検証エラー最小の候補を退避する（上限到達＝exhausted 時に返す・FR-005）
  let best: { slidesJson: string; errors: ValidationError[] } | null = null
  let repairFeedback = request.repairFeedback
  // 適用中テーマ・登録済みコンポーネント/アイコンは試行中に変わらないため一度だけ組み立てる（#211）
  const themeConstraints = buildThemeConstraintsPrompt()

  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
    if (cancelRequested) return cancelledResult(attempt - 1)

    onProgress?.({ attempt, maxAttempts: MAX_GENERATE_ATTEMPTS, phase: 'generating' })

    let candidate: string
    try {
      candidate = await invoke<string>('generate_slides', { request: { ...request, repairFeedback, themeConstraints } })
    } catch (e) {
      // ゲート拒否・タイムアウト・HTTP エラー・中断はいずれも Rust 側で Err になる。
      // 中断要求済みなら cancelled、それ以外は failed に分類する（Rust はキー等を漏らさず整形済み・NFR-004）。
      if (cancelRequested) return cancelledResult(attempt - 1)
      const errorMessage = e instanceof Error ? e.message : String(e)
      console.error('[ai-slide-generation] 生成に失敗しました:', e)
      return { outcome: 'failed', slidesJson: null, validationErrors: [], attempts: attempt, errorMessage }
    }

    // invoke 解決後の中断再検査。in-flight 完了と中断がわずかに競合した場合でも、明示中断した候補は
    // succeeded/exhausted として適用せず退避する（無効候補で器を破壊しない・FR-008）
    if (cancelRequested) return cancelledResult(attempt)

    onProgress?.({ attempt, maxAttempts: MAX_GENERATE_ATTEMPTS, phase: 'validating' })
    const { data, errors: structuralErrors } = parseSlides(candidate)
    // 構造的バリデーション（getValidationErrors）＋生成専用のスキーマ適合チェック（schema/slide-content-schema.json）
    const errors = [...structuralErrors, ...getSchemaConformanceErrors(data)]

    if (errors.length === 0) {
      return { outcome: 'succeeded', slidesJson: candidate, validationErrors: [], attempts: attempt, errorMessage: null }
    }

    // 最良候補（検証エラー最小）を更新
    if (best === null || errors.length < best.errors.length) {
      best = { slidesJson: candidate, errors }
    }

    // 次試行があるなら検証エラー要約を repairFeedback に載せて再投入する
    if (attempt < MAX_GENERATE_ATTEMPTS) {
      onProgress?.({ attempt, maxAttempts: MAX_GENERATE_ATTEMPTS, phase: 'repairing' })
      repairFeedback = summarizeValidationErrors(errors, getThemeWarnings(data.theme, data.slides))
    }
  }

  // 上限到達: 最良候補を退避して返す（exhausted）
  return {
    outcome: 'exhausted',
    slidesJson: best?.slidesJson ?? null,
    validationErrors: best?.errors ?? [],
    attempts: MAX_GENERATE_ATTEMPTS,
    errorMessage: null,
  }
}
