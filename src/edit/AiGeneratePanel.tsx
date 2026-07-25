import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'
import type { GenerateProgress, GeneratorKind } from '../aiGenerate'
import { cancelGenerate, checkExternalAvailable, clearVertexConfig, gcloudLogin, generateSlides, getVertexConfig, getVertexStatus, setGenerationEnabled, setVertexConfig } from '../aiGenerate'

type PanelStatus = { kind: 'idle' | 'ok' | 'warn' | 'error'; message: string }

/**
 * 編集モード内の AI 生成パネル（#14・FR-001/007/010）。
 *
 * プロンプト入力・方式選択（内蔵 Vertex / 外部 CLI）・事前ゲート（内蔵=Vertex 設定済み／外部=CLI 可用性）・
 * 進捗表示・中断・方式別の課金/オンライン依存注意書きを提供する。生成結果は `onApply`（全体置換）で
 * 器の単一真実源 `text` へ流し込む。失敗/中断時は器に触れず手動編集へ退避する（FR-008）。
 *
 * 内蔵は Vertex AI（GCP）。project/region/model を設定し、`gcloud auth application-default login` で ADC を用意する。
 * マウント時に生成を有効化し、アンマウントで無効化する（capability ゲート・DC-003）。
 * 色は editorUiTheme と `--theme-*` 経由（親 SlideEditor の ThemeProvider を継承・A-002/DC-006）。
 */
export function AiGeneratePanel({ currentText, onApply }: { currentText: string; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<GeneratorKind>('builtin-vertex')
  const [useBase, setUseBase] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [externalAvailable, setExternalAvailable] = useState(false)
  // 内蔵（Vertex）設定フォーム
  const [projectId, setProjectId] = useState('')
  const [region, setRegion] = useState('')
  const [model, setModel] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [status, setStatus] = useState<PanelStatus>({ kind: 'idle', message: '' })

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

  // warn は accent 系。--theme-accent は未定義環境があるため --theme-primary へフォールバックし色が消えないようにする
  const statusColor = status.kind === 'error' ? 'var(--theme-primary)' : status.kind === 'warn' ? 'var(--theme-accent, var(--theme-primary))' : 'var(--theme-success)'

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
      const result = await generateSlides({ prompt: prompt.trim(), kind, baseSlides: useBase ? currentText : undefined }, (p) => setProgress(p))
      switch (result.outcome) {
        case 'succeeded':
          if (result.slidesJson) onApply(result.slidesJson)
          setStatus({ kind: 'ok', message: t('aiGenerate.succeeded', '生成が完了しました') })
          break
        case 'exhausted':
          // 検証エラーが残る最良候補を反映する。器の保存ゲートが無効データの保存を防ぐため手動修正へ誘導（FR-005）
          if (result.slidesJson) onApply(result.slidesJson)
          setStatus({ kind: 'warn', message: t('aiGenerate.exhausted', '自動修正の上限に達しました。検証エラーが残る候補を反映しました（手動で修正してください）') })
          break
        case 'cancelled':
          // 器には触れず現状を保持する（安全退避・FR-008）
          setStatus({ kind: 'warn', message: t('aiGenerate.cancelled', '生成を中断しました') })
          break
        default:
          // failed: 器には触れず手動編集へ退避する（既存データ保持・FR-008）
          setStatus({ kind: 'error', message: t('aiGenerate.failed', '生成に失敗しました。手動編集を続けてください') })
          break
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <Box sx={{ borderBottom: '1px solid var(--theme-border)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5 }}>
        <Button size="small" variant={expanded ? 'contained' : 'outlined'} onClick={() => setExpanded((v) => !v)}>
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
          <Typography variant="caption" sx={{ color: 'var(--theme-text-muted)' }}>
            {kind === 'builtin-vertex'
              ? t('aiGenerate.billingNoticeBuiltin', '内蔵生成は GCP Vertex AI を利用します。オンライン接続と GCP プロジェクトの従量課金が発生します。')
              : t('aiGenerate.billingNoticeExternal', '外部生成はローカルの Claude Code を利用します。お使いの Claude の契約・利用条件に従います。')}
          </Typography>

          {/* 内蔵: Vertex 設定（project/region/model）＋GCP ログイン（事前ゲートの設定導線・FR-006） */}
          {kind === 'builtin-vertex' && (
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
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

          {/* 事前ゲート未充足のヒント（FR-007） */}
          {kind === 'builtin-vertex' && !configured && (
            <Typography variant="caption" sx={{ color: 'var(--theme-primary)' }}>
              {t('aiGenerate.gateBuiltinNotConfigured', 'project ID・リージョン・モデルを設定してください（初回は「GCP ログイン」も必要です）。')}
            </Typography>
          )}
          {kind === 'external-claude-code' && !externalAvailable && (
            <Typography variant="caption" sx={{ color: 'var(--theme-primary)' }}>
              {t('aiGenerate.gateExternalUnavailable', 'Claude Code CLI が見つかりません（インストールと PATH を確認してください）。')}
            </Typography>
          )}

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
          <Stack direction="row" spacing={1} alignItems="center">
            {running ? (
              <Button size="small" variant="outlined" color="inherit" onClick={() => void cancelGenerate()}>
                {t('aiGenerate.cancel', '中断')}
              </Button>
            ) : (
              <Button size="small" variant="contained" onClick={() => void handleGenerate()} disabled={!canGenerate}>
                {t('aiGenerate.generate', '生成')}
              </Button>
            )}
            {running && progress && (
              <Typography variant="caption" sx={{ color: 'var(--theme-text-muted)' }}>
                {phaseLabel(progress.phase)} · {t('aiGenerate.attempt', '試行 {current}/{max}').replace('{current}', String(progress.attempt)).replace('{max}', String(progress.maxAttempts))}
              </Typography>
            )}
          </Stack>
          {running && <LinearProgress />}

          {status.kind !== 'idle' && (
            <Typography variant="body2" role="status" sx={{ wordBreak: 'break-word', color: statusColor }}>
              {status.message}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  )
}
