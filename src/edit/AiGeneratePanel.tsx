import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeProvider } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import DeleteIcon from '@mui/icons-material/Delete'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'
import { theme as presentationTheme } from '../theme'
import { getThemeWarnings } from '../applyTheme'
import type { ThemeData } from '../data'
import { resolveCanvasSize } from '../hooks/useReveal'
import { SlideRenderer } from '../components/SlideRenderer'
import { LazyImageContext } from '../components/FallbackImage'
import type { ClaudeCliEnvVar, GenerateProgress, GeneratedCandidate, GeneratorKind, PromptIntent } from '../aiGenerate'
import {
  cancelGenerate,
  checkExternalAvailable,
  clearClaudeCliConfig,
  clearVertexConfig,
  gcloudLogin,
  generateSlides,
  getClaudeCliConfig,
  getVertexConfig,
  getVertexStatus,
  setClaudeCliConfig,
  setGenerationEnabled,
  setVertexConfig,
  toGeneratedCandidate,
} from '../aiGenerate'
import { checkAllSlidesVisually, deriveCheckableDeck, formatSlideVisualWarnings, type CheckableDeck } from './checkAllSlidesVisually'

/** 見た目チェック→AI修正ループの上限（generateSlides自身の MAX_GENERATE_ATTEMPTS とは別軸。
 * 1ラウンド=AI呼び出し1回+再チェック1回。上限に達しても警告が残る場合はその時点の候補をそのまま差分確認へ渡す */
const MAX_VISUAL_FIX_ROUNDS = 2

const VISUAL_FIX_PROMPT = '以下の見た目の問題を解消してください。スライドの文言や構成の調整、またはtheme設定（色・フォント等）の調整で対応し、レイアウトの実装やコンポーネントの使い方は変えず、各スライドの意味や趣旨も変えないでください。'

type PanelStatus = { kind: 'idle' | 'ok' | 'warn' | 'error'; message: string }

/**
 * 編集モード内の AI 生成パネル（#14・FR-001/007/010）。
 *
 * プロンプト入力・入力モード選択（新規内容 / 変更指示。AI がプロンプトの意味を取り違えないための明示・#302）・
 * 方式選択（内蔵 Vertex / 外部 CLI）・事前ゲート（内蔵=Vertex 設定済み／外部=CLI 可用性）・
 * 進捗表示・中断・方式別の課金/オンライン依存注意書きを提供する。生成結果は `onApply`（全体置換）で
 * 器の単一真実源 `text` へ流し込む。失敗/中断時は器に触れず手動編集へ退避する（FR-008）。
 *
 * 内蔵は Vertex AI（GCP）。project/region/model を設定し、`gcloud auth application-default login` で ADC を用意する。
 * マウント時に生成を有効化し、アンマウントで無効化する（capability ゲート・DC-003）。
 * 色は editorUiTheme と `--fixed-*`（プレゼンのテーマ変更から独立した固定パレット。§9.1 のテーマ波及対策）経由。
 */
export function AiGeneratePanel({
  currentText,
  onApply,
  defaultExpanded = false,
  baseDir = '',
  brandTheme,
}: {
  currentText: string
  onApply: (candidate: GeneratedCandidate) => void
  /** マウント時にパネルを展開済みにするか（ホーム画面の「AIで新規作成」導線から遷移した場合に使用） */
  defaultExpanded?: boolean
  /** 相対アセットの基準ディレクトリ（SlideEditor.tsx の source.baseDir と同じ値。見た目チェックの
   * オフスクリーン描画をライブプレビューと同じ規則でアセット解決するために必要） */
  baseDir?: string
  /** meta.brandTheme の解決済みテーマ（SlideEditor.tsx の brandTheme state と同じ値。見た目チェックの
   * オフスクリーン描画をライブプレビューと同じ規則でブランドテーマ合成するために必要） */
  brandTheme?: ThemeData
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<GeneratorKind>('builtin-vertex')
  const [promptIntent, setPromptIntent] = useState<PromptIntent>('new-content')
  const [useBase, setUseBase] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [externalAvailable, setExternalAvailable] = useState(false)
  // 内蔵（Vertex）設定フォーム
  const [projectId, setProjectId] = useState('')
  const [region, setRegion] = useState('')
  const [model, setModel] = useState('')
  // 外部（Claude Code CLI）へ渡す環境変数設定フォーム（#152）
  const [envVars, setEnvVars] = useState<ClaudeCliEnvVar[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [status, setStatus] = useState<PanelStatus>({ kind: 'idle', message: '' })
  // 見た目チェック→AI修正（全スライドVisualCheckボタン）専用の状態。既存の生成状態（running/progress）とは
  // 独立させ、実行中は両ボタンを相互排他にする（cancelGenerate の対象が module 内で単一のため）
  const [visualFixRunning, setVisualFixRunning] = useState(false)
  const [visualFixPhase, setVisualFixPhase] = useState<string | null>(null)
  // オフスクリーン描画対象（チェック実行中だけ非nullになる）。実DOM実測のため隠しコンテナに随時コミットする
  const [offscreenDeck, setOffscreenDeck] = useState<CheckableDeck | null>(null)
  const [offscreenIndex, setOffscreenIndex] = useState<number | null>(null)
  const offscreenContainerRef = useRef<HTMLDivElement>(null)

  // 編集モード内で生成を有効化し、離脱で無効化する（capability ゲート・DC-003）。失敗は UI をブロックしない
  useEffect(() => {
    void setGenerationEnabled(true).catch(() => undefined)
    return () => {
      void setGenerationEnabled(false).catch(() => undefined)
    }
  }, [])

  // 内蔵の事前ゲート: 保存済み設定を取得してフォームへプリフィル＋設定済み状態を反映する
  const refreshVertex = () => {
    void getVertexConfig()
      .then((c) => {
        if (c) {
          setProjectId(c.projectId)
          setRegion(c.region)
          setModel(c.model)
        }
      })
      .catch(() => undefined)
    void getVertexStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false))
  }
  useEffect(refreshVertex, [])

  // 外部（Claude Code CLI）の環境変数設定を取得してフォームへプリフィルする（#152）
  useEffect(() => {
    void getClaudeCliConfig()
      .then((c) => setEnvVars(c?.envVars ?? []))
      .catch(() => undefined)
  }, [])

  // 外部の事前ゲート: 外部方式を選んだときだけ CLI 可用性を確認する（builtin 時に `claude --version` を spawn しない）
  useEffect(() => {
    if (kind !== 'external-claude-code') return
    void checkExternalAvailable()
      .then(setExternalAvailable)
      .catch(() => setExternalAvailable(false))
  }, [kind])

  const canGenerate = useMemo(() => {
    if (running || prompt.trim() === '') return false
    return kind === 'builtin-vertex' ? configured : externalAvailable
  }, [running, prompt, kind, configured, externalAvailable])

  // 3 項目すべて入力済みなら保存可能
  const canSaveVertex = projectId.trim() !== '' && region.trim() !== '' && model.trim() !== ''

  // warn は accent 系だが --theme-accent は未定義環境があるため、そもそも primary に統一する
  const statusColor = status.kind === 'error' || status.kind === 'warn' ? 'var(--fixed-primary)' : 'var(--fixed-success)'

  const phaseLabel = (phase: GenerateProgress['phase']): string => {
    if (phase === 'generating') return t('aiGenerate.phaseGenerating', '生成中')
    if (phase === 'validating') return t('aiGenerate.phaseValidating', '検証中')
    return t('aiGenerate.phaseRepairing', '自動修正中')
  }

  const handleSaveVertex = async () => {
    try {
      await setVertexConfig({ projectId: projectId.trim(), region: region.trim(), model: model.trim() })
      setConfigured(true)
      setStatus({ kind: 'ok', message: t('aiGenerate.vertexSaved', 'Vertex 設定を保存しました') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('aiGenerate.vertexSaveFailed', 'Vertex 設定の保存に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleClearVertex = async () => {
    try {
      await clearVertexConfig()
      setConfigured(false)
      setStatus({ kind: 'ok', message: t('aiGenerate.vertexCleared', 'Vertex 設定を削除しました') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('aiGenerate.vertexClearFailed', 'Vertex 設定の削除に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // 空行（追加ボタン由来）を除いた有効な行のみ保存する（キー未入力の行は破棄）
  const handleSaveClaudeCliConfig = async () => {
    try {
      const trimmed = envVars.map((v) => ({ key: v.key.trim(), value: v.value.trim() })).filter((v) => v.key !== '')
      await setClaudeCliConfig({ envVars: trimmed })
      setEnvVars(trimmed)
      setStatus({ kind: 'ok', message: t('aiGenerate.claudeCliSaved', '環境変数設定を保存しました') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('aiGenerate.claudeCliSaveFailed', '環境変数設定の保存に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleClearClaudeCliConfig = async () => {
    try {
      await clearClaudeCliConfig()
      setEnvVars([])
      setStatus({ kind: 'ok', message: t('aiGenerate.claudeCliCleared', '環境変数設定を削除しました') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('aiGenerate.claudeCliClearFailed', '環境変数設定の削除に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleAddEnvVarRow = () => setEnvVars((prev) => [...prev, { key: '', value: '' }])
  const handleRemoveEnvVarRow = (index: number) => setEnvVars((prev) => prev.filter((_, i) => i !== index))
  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string) => setEnvVars((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))

  const handleGcloudLogin = async () => {
    try {
      await gcloudLogin()
      setStatus({ kind: 'ok', message: t('aiGenerate.gcloudLoginDone', 'GCP ログインが完了しました') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('aiGenerate.gcloudLoginFailed', 'GCP ログインに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleGenerate = async () => {
    setRunning(true)
    setProgress(null)
    setStatus({ kind: 'idle', message: '' })
    try {
      const result = await generateSlides({ prompt: prompt.trim(), kind, baseSlides: useBase ? currentText : undefined, promptIntent }, (p) => setProgress(p))
      // 適用可能な候補（succeeded/exhausted かつ slidesJson 非 null）を差分確認ダイアログへ渡す（①）。
      // 実際の反映は SlideEditor 側の [適用する] で行う。exhausted で残る validationErrors も併せて渡し、
      // 何が問題かを確認できるようにする（#47）
      const candidate = toGeneratedCandidate(result)
      if (candidate) onApply(candidate)
      switch (result.outcome) {
        case 'succeeded':
          setStatus({ kind: 'ok', message: t('aiGenerate.succeeded', '生成が完了しました。差分を確認して適用してください') })
          break
        case 'exhausted':
          // 器の保存ゲートが無効データの保存を防ぐため手動修正へ誘導（FR-005/FR-008）
          setStatus({ kind: 'warn', message: t('aiGenerate.exhausted', '自動修正の上限に達しました。検証エラーが残る候補です。差分を確認してください（手動修正が必要な場合があります）') })
          break
        case 'cancelled':
          // 器には触れず現状を保持する（安全退避・FR-008）
          setStatus({ kind: 'warn', message: t('aiGenerate.cancelled', '生成を中断しました') })
          break
        default: {
          // failed: 器には触れず手動編集へ退避する（既存データ保持・FR-008）。
          // 実際の失敗理由（Rust 側 GenerateError の整形済み文言）を併記し調査可能にする（#151）
          const base = t('aiGenerate.failed', '生成に失敗しました。手動編集を続けてください')
          setStatus({ kind: 'error', message: result.errorMessage ? `${base}: ${result.errorMessage}` : base })
          break
        }
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  /** DOM実測の見た目警告（slideResults）とテーマ設定の静的検証警告（themeWarnings。getThemeWarnings・applyTheme.ts）
   * をまとめて返す型。検証の種類は異なるが、AI修正の対象という点では同じ repairFeedback にまとめて渡す */
  type VisualCheckResult = { slideResults: Awaited<ReturnType<typeof checkAllSlidesVisually>>; themeWarnings: string[] }

  // 指定した slides.json テキストを全スライド分オフスクリーンに描画し、警告があるスライドとテーマ設定の警告を集めて返す。
  // deriveCheckableDeck が null（JSON構文/構造エラー）の場合はチェック不能として null を返す
  // （「警告0件」と区別する。空デッキ＝0スライドでもテーマ警告はあり得るため slideResults のみ空配列にする）
  const runVisualCheck = async (text: string): Promise<VisualCheckResult | null> => {
    const deck = deriveCheckableDeck(text, baseDir, brandTheme)
    if (!deck) return null
    const themeWarnings = getThemeWarnings(deck.theme, deck.slides, deck.logo, deck.confidential)
    if (deck.slides.length === 0) return { slideResults: [], themeWarnings }
    flushSync(() => setOffscreenDeck(deck))
    try {
      const slideResults = await checkAllSlidesVisually(deck.slides, setOffscreenIndex, () => offscreenContainerRef.current?.querySelector<HTMLElement>('section.slide-container') ?? null)
      return { slideResults, themeWarnings }
    } finally {
      flushSync(() => {
        setOffscreenDeck(null)
        setOffscreenIndex(null)
      })
    }
  }

  const handleVisualCheckFix = async () => {
    setVisualFixRunning(true)
    setStatus({ kind: 'idle', message: '' })
    try {
      setVisualFixPhase(t('aiGenerate.visualCheckChecking', '全スライドをチェック中'))
      let results = await runVisualCheck(currentText)
      if (results === null) {
        setStatus({ kind: 'error', message: t('aiGenerate.visualCheckInvalidJson', 'JSON に構文エラーがあるため見た目チェックを実行できません') })
        return
      }
      if (results.slideResults.length === 0 && results.themeWarnings.length === 0) {
        setStatus({ kind: 'ok', message: t('aiGenerate.visualCheckNoIssues', '見た目の問題は見つかりませんでした') })
        return
      }

      let baseSlides = currentText
      let visualWarnings = formatSlideVisualWarnings(results.slideResults)
      let themeWarnings = results.themeWarnings
      let finalCandidate: GeneratedCandidate | null = null
      let remainingWarnings = results.slideResults.length + results.themeWarnings.length

      for (let round = 1; round <= MAX_VISUAL_FIX_ROUNDS; round++) {
        setVisualFixPhase(t('aiGenerate.visualCheckFixing', 'AI に修正を依頼中'))
        const result = await generateSlides({ prompt: VISUAL_FIX_PROMPT, kind, baseSlides, visualWarnings, themeWarnings, promptIntent: 'change-instruction' }, (p) => setProgress(p))

        if (result.outcome === 'cancelled') {
          setStatus({ kind: 'warn', message: t('aiGenerate.cancelled', '生成を中断しました') })
          return
        }
        if (result.outcome !== 'succeeded' && result.outcome !== 'exhausted') {
          const base = t('aiGenerate.failed', '生成に失敗しました。手動編集を続けてください')
          setStatus({ kind: 'error', message: result.errorMessage ? `${base}: ${result.errorMessage}` : base })
          return
        }

        const candidate = toGeneratedCandidate(result)
        if (!candidate) {
          setStatus({ kind: 'error', message: t('aiGenerate.failed', '生成に失敗しました。手動編集を続けてください') })
          return
        }
        finalCandidate = candidate

        if (result.outcome === 'exhausted') {
          remainingWarnings = -1 // スキーマ自動修正の上限到達を「見た目の残警告」と区別するための特別値
          break
        }

        setVisualFixPhase(t('aiGenerate.visualCheckRechecking', '修正結果を再チェック中'))
        results = await runVisualCheck(candidate.slidesJson)
        if (results === null) {
          // succeeded は generateSlides 自身が parseSlides で検証済みのため通常発生しないが、
          // 万一発生した場合も「残警告0件」に丸めず区別する
          remainingWarnings = -2 // AI修正結果自体が再チェック不能だったことを示す特別値
          break
        }
        remainingWarnings = results.slideResults.length + results.themeWarnings.length
        if (remainingWarnings === 0) break
        baseSlides = candidate.slidesJson
        visualWarnings = formatSlideVisualWarnings(results.slideResults)
        themeWarnings = results.themeWarnings
      }

      if (finalCandidate) {
        onApply(finalCandidate)
        if (remainingWarnings === -1) {
          setStatus({ kind: 'warn', message: t('aiGenerate.exhausted', '自動修正の上限に達しました。検証エラーが残る候補です。差分を確認してください（手動修正が必要な場合があります）') })
        } else if (remainingWarnings === -2) {
          setStatus({ kind: 'warn', message: t('aiGenerate.visualCheckInvalidJson', 'JSON に構文エラーがあるため見た目チェックを実行できません') })
        } else if (remainingWarnings === 0) {
          setStatus({ kind: 'ok', message: t('aiGenerate.visualCheckFixed', '見た目の問題を修正しました。差分を確認して適用してください') })
        } else {
          setStatus({
            kind: 'warn',
            message: t('aiGenerate.visualCheckRemaining', '{count} 件の見た目の警告が残っています。差分を確認してください').replace('{count}', String(remainingWarnings)),
          })
        }
      }
    } finally {
      setVisualFixRunning(false)
      setVisualFixPhase(null)
      setProgress(null)
    }
  }

  const canRunVisualCheckFix = kind === 'builtin-vertex' ? configured : externalAvailable
  const { width: offscreenWidth, height: offscreenHeight } = resolveCanvasSize(offscreenDeck?.theme?.canvas)
  const offscreenSlide = offscreenDeck && offscreenIndex !== null ? offscreenDeck.slides[offscreenIndex] : undefined

  return (
    <Box sx={{ borderBottom: '1px solid var(--fixed-border)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5 }}>
        <Button size="small" variant={expanded ? 'contained' : 'outlined'} endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {t('aiGenerate.title', 'AI 生成')}
        </Button>
        {!expanded && status.kind !== 'idle' && (
          <Typography variant="caption" sx={{ color: statusColor, wordBreak: 'break-word' }}>
            {status.message}
          </Typography>
        )}
      </Stack>

      {expanded && (
        <Stack spacing={1} sx={{ px: 1, pb: 1 }}>
          {/* 方式選択（内蔵 Vertex / 外部 CLI） */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={kind}
            onChange={(_, v) => {
              if (v) setKind(v as GeneratorKind)
            }}
          >
            <ToggleButton value="builtin-vertex">{t('aiGenerate.methodBuiltin', '内蔵（Vertex AI）')}</ToggleButton>
            <ToggleButton value="external-claude-code">{t('aiGenerate.methodExternal', '外部（Claude Code CLI）')}</ToggleButton>
          </ToggleButtonGroup>

          {/* 方式別の課金/オンライン依存の注意書き（PRD §5.2・DC-006） */}
          <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
            {kind === 'builtin-vertex'
              ? t('aiGenerate.billingNoticeBuiltin', '内蔵生成は GCP Vertex AI を利用します。オンライン接続と GCP プロジェクトの従量課金が発生します。')
              : t('aiGenerate.billingNoticeExternal', '外部生成はローカルの Claude Code を利用します。お使いの Claude の契約・利用条件に従います。')}
          </Typography>

          {/* 内蔵: Vertex 設定（project/region/model）＋GCP ログイン（事前ゲートの設定導線・FR-006） */}
          {kind === 'builtin-vertex' && (
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
                {t('aiGenerate.vertexLabel', 'Vertex AI 設定')}: {configured ? t('aiGenerate.vertexConfigured', '設定済み') : t('aiGenerate.vertexNotConfigured', '未設定')}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <TextField size="small" label={t('aiGenerate.vertexProjectId', 'GCP プロジェクト ID')} value={projectId} onChange={(e) => setProjectId(e.target.value)} sx={{ width: 220 }} />
                <TextField size="small" label={t('aiGenerate.vertexRegion', 'リージョン')} placeholder="us-east5 / global" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ width: 160 }} />
                <TextField size="small" label={t('aiGenerate.vertexModel', 'モデル ID')} placeholder="claude-...@YYYYMMDD" value={model} onChange={(e) => setModel(e.target.value)} sx={{ width: 240 }} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={() => void handleSaveVertex()} disabled={!canSaveVertex}>
                  {t('aiGenerate.vertexSave', '設定を保存')}
                </Button>
                <Button size="small" variant="outlined" onClick={() => void handleGcloudLogin()}>
                  {t('aiGenerate.gcloudLogin', 'GCP ログイン')}
                </Button>
                {configured && (
                  <Button size="small" color="inherit" onClick={() => void handleClearVertex()}>
                    {t('aiGenerate.vertexClear', '設定を削除')}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}

          {/* 外部: Claude CLI へ渡す環境変数設定（CLAUDE_CONFIG_DIR 等・#152） */}
          {kind === 'external-claude-code' && (
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
                {t('aiGenerate.claudeCliLabel', 'Claude CLI 環境変数設定')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
                {t('aiGenerate.claudeCliHint', 'GUI 起動時にシェルプロファイルの環境変数が継承されない場合、claude CLI へ渡す環境変数（例: CLAUDE_CONFIG_DIR）をここで設定できます。')}
              </Typography>
              {envVars.map((envVar, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <TextField size="small" label={t('aiGenerate.claudeCliEnvKeyLabel', '変数名')} placeholder="CLAUDE_CONFIG_DIR" value={envVar.key} onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)} sx={{ width: 220 }} />
                  <TextField size="small" label={t('aiGenerate.claudeCliEnvValueLabel', '値')} value={envVar.value} onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)} sx={{ width: 260 }} />
                  <IconButton size="small" aria-label={t('aiGenerate.claudeCliRemoveRow', '行を削除')} onClick={() => handleRemoveEnvVarRow(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={handleAddEnvVarRow}>
                  {t('aiGenerate.claudeCliAddRow', '+ 追加')}
                </Button>
                <Button size="small" variant="outlined" onClick={() => void handleSaveClaudeCliConfig()}>
                  {t('aiGenerate.claudeCliSave', '設定を保存')}
                </Button>
                {envVars.length > 0 && (
                  <Button size="small" color="inherit" onClick={() => void handleClearClaudeCliConfig()}>
                    {t('aiGenerate.claudeCliClear', '設定を削除')}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}

          {/* 事前ゲート未充足のヒント（FR-007） */}
          {kind === 'builtin-vertex' && !configured && (
            <Typography variant="caption" sx={{ color: 'var(--fixed-primary)' }}>
              {t('aiGenerate.gateBuiltinNotConfigured', 'project ID・リージョン・モデルを設定してください（初回は「GCP ログイン」も必要です）。')}
            </Typography>
          )}
          {kind === 'external-claude-code' && !externalAvailable && (
            <Typography variant="caption" sx={{ color: 'var(--fixed-primary)' }}>
              {t('aiGenerate.gateExternalUnavailable', 'Claude Code CLI が見つかりません（インストールと PATH を確認してください）。')}
            </Typography>
          )}

          {/* 入力モード（プロンプトが新規内容か変更指示かを明示・#302） */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={promptIntent}
            onChange={(_, v) => {
              if (v) setPromptIntent(v as PromptIntent)
            }}
          >
            <ToggleButton value="new-content">{t('aiGenerate.intentNewContent', '新しいスライド内容を記述する')}</ToggleButton>
            <ToggleButton value="change-instruction">{t('aiGenerate.intentChangeInstruction', '既存スライドへの変更を指示する')}</ToggleButton>
          </ToggleButtonGroup>

          {/* プロンプト入力 */}
          <TextField
            label={t('aiGenerate.promptLabel', 'プロンプト')}
            placeholder={t('aiGenerate.promptPlaceholder', '作りたいスライドの内容を説明してください')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            multiline
            minRows={2}
            maxRows={6}
            size="small"
            fullWidth
            disabled={running}
          />

          <FormControlLabel
            control={<Checkbox size="small" checked={useBase} onChange={(e) => setUseBase(e.target.checked)} disabled={running} />}
            label={<Typography variant="body2">{t('aiGenerate.useBase', '現在のスライドを土台にする')}</Typography>}
          />

          {/* 実行/中断 */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {running ? (
              <Button size="small" variant="outlined" color="inherit" onClick={() => void cancelGenerate()}>
                {t('aiGenerate.cancel', '中断')}
              </Button>
            ) : (
              <Button size="small" variant="contained" onClick={() => void handleGenerate()} disabled={!canGenerate || visualFixRunning}>
                {t('aiGenerate.generate', '生成')}
              </Button>
            )}
            {/* 全スライドVisualCheック→AI修正（今回の見切れ修正の手順を自動化）。プロンプト不要で、
                対象スライドの妥当性のみをゲートにする */}
            {visualFixRunning ? (
              <Button size="small" variant="outlined" color="inherit" onClick={() => void cancelGenerate()}>
                {t('aiGenerate.cancel', '中断')}
              </Button>
            ) : (
              <Button size="small" variant="outlined" onClick={() => void handleVisualCheckFix()} disabled={running || !canRunVisualCheckFix}>
                {t('aiGenerate.visualCheckButton', '見た目をチェックして修正')}
              </Button>
            )}
            {running && progress && (
              <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
                {phaseLabel(progress.phase)} · {t('aiGenerate.attempt', '試行 {current}/{max}').replace('{current}', String(progress.attempt)).replace('{max}', String(progress.maxAttempts))}
              </Typography>
            )}
            {visualFixRunning && (
              <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
                {visualFixPhase}
                {progress ? ` · ${phaseLabel(progress.phase)} · ${t('aiGenerate.attempt', '試行 {current}/{max}').replace('{current}', String(progress.attempt)).replace('{max}', String(progress.maxAttempts))}` : ''}
              </Typography>
            )}
          </Stack>
          {(running || visualFixRunning) && <LinearProgress />}

          {status.kind !== 'idle' && (
            <Typography variant="body2" role="status" sx={{ wordBreak: 'break-word', color: statusColor }}>
              {status.message}
            </Typography>
          )}
        </Stack>
      )}

      {/* 見た目チェックのオフスクリーン描画先（画面外・非表示）。SlideRenderer.Slide をキャンバス実寸
          （transform scale なし）で1枚だけ描画し、実DOMのgetBoundingClientRect等で実測する（DC-001流用）。
          LazyImageContext を false にして即時読み込みにするのは SlidePreview と同じ理由（#224） */}
      <div ref={offscreenContainerRef} aria-hidden="true" style={{ position: 'fixed', top: 0, left: -100000, width: offscreenWidth, height: offscreenHeight, overflow: 'hidden', pointerEvents: 'none' }}>
        {offscreenDeck && offscreenSlide && (
          <ThemeProvider theme={presentationTheme}>
            <div className="reveal">
              <div className="slides">
                <LazyImageContext.Provider value={false}>
                  <SlideRenderer.Slide
                    slide={offscreenSlide}
                    logo={offscreenDeck.logo}
                    confidential={offscreenDeck.confidential}
                    theme={offscreenDeck.theme}
                    index={offscreenIndex ?? 0}
                    total={offscreenDeck.slides.length}
                    sections={offscreenDeck.sections}
                  />
                </LazyImageContext.Provider>
              </div>
            </div>
          </ThemeProvider>
        )}
      </div>
    </Box>
  )
}
