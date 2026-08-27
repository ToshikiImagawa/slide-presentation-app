import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { diffLines } from 'diff'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { useTranslation } from '../i18n'
import { getContrastRatio, TEXT_COLOR_KEYS, WCAG_AA_THRESHOLD } from '../applyTheme'
import type { ColorPalette, ThemeData, ValidationError } from '../data/types'
import { computeSlidesDiff, hasChanges, selectAllChanges, type DiffSelection, type FieldChange, type SlideChange } from './slidesDiff'
import { prettyPrintJson } from './slidesSerialize'
import { ValidationErrorList } from './ValidationErrorList'

/**
 * AI 生成結果を器へ適用する前の確認ダイアログ（①・案3「構造サマリ」）。
 *
 * before（現在の器のテキスト）と after（生成候補）の**構造差分**を、スライド単位の
 * 追加/変更/削除とメタ変更のサマリで見せ、各項目は展開して before/after の詳細を確認できる。
 * 構造解析不能（構文不正・id 欠落/重複）のときは「全体置換」のフォールバック表示にする。
 * テーマ・スライド単位はチェックボックスで選択できる（初期値は全選択）。[適用する] で `onApply`（選択された
 * DiffSelection を渡す。フォールバック時は null で全体置換）、[キャンセル] で `onCancel`（器に触れない・FR-008）。
 * `validationErrors` が非空（自動修正の上限到達＝exhausted）のときは、壊れた候補を誤って保存できないよう
 * [適用する] を無効化し、代わりに [再生成する] で同じプロンプト・設定のまま再試行できる（`onRegenerate`）。
 */
export interface GeneratedDiffDialogProps {
  open: boolean
  /** 現在の器のテキスト（変更前） */
  beforeText: string
  /** 適用候補の生成テキスト（変更後） */
  afterText: string
  /** 適用候補に残る検証エラー（自動修正の上限到達＝exhausted で非空になりうる・#47） */
  validationErrors: ValidationError[]
  /** 選択された適用範囲。構造解析不能（フォールバック＝全体置換）のときは null */
  onApply: (selection: DiffSelection | null) => void
  onCancel: () => void
  /** 検証エラーが残る候補を破棄し、同じプロンプト・設定で再生成する（AiGeneratePanel.regenerate 経由） */
  onRegenerate: () => void
}

/** 変更種別 → MUI パレット色（追加=success/変更=warning/削除=error）。 */
const KIND_COLOR: Record<FieldChange['kind'], 'success' | 'warning' | 'error'> = {
  added: 'success',
  changed: 'warning',
  removed: 'error',
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : `${ratio.toFixed(2)}:1`
}

/** 色見本（スウォッチ+hex値）。値が無ければ「—」を表示する（BrandConfirmDialog でも再利用・#168） */
export function ColorSwatch({ value }: { value?: string }) {
  if (!value) {
    return (
      <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
        —
      </Typography>
    )
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 12, height: 12, borderRadius: '2px', border: '1px solid var(--fixed-border)', backgroundColor: value, flexShrink: 0 }} />
      <Typography component="span" sx={{ fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
        {value}
      </Typography>
    </Stack>
  )
}

/** before/after の整形済み JSON を git diff 風の行単位表示（追加=緑/削除=赤）に変換する。 */
function renderLineDiff(before: unknown, after: unknown) {
  const parts = diffLines(jsonBlock(before), jsonBlock(after))
  return parts.flatMap((part, partIndex) => {
    // diffLines の各 part は末尾に改行を含む複数行の塊。末尾の空要素（改行由来）は行として扱わない
    const lines = part.value.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    const prefix = part.added ? '+' : part.removed ? '-' : ' '
    return lines.map((line, lineIndex) => (
      <Box
        key={`${partIndex}-${lineIndex}`}
        component="span"
        sx={{
          display: 'block',
          px: 0.5,
          backgroundColor: part.added ? (theme) => alpha(theme.palette.success.main, 0.15) : part.removed ? (theme) => alpha(theme.palette.error.main, 0.15) : undefined,
          color: part.added ? 'success.main' : part.removed ? 'error.main' : undefined,
        }}
      >
        {prefix} {line}
      </Box>
    ))
  })
}

export function GeneratedDiffDialog({ open, beforeText, afterText, validationErrors, onApply, onCancel, onRegenerate }: GeneratedDiffDialogProps) {
  const { t } = useTranslation()
  // 検証エラーが残る候補（exhausted）は構造解析可否に関わらず誤保存を防ぐ（[適用する]無効化＋[再生成する]表示）
  const hasValidationErrors = validationErrors.length > 0
  // 閉じているときは差分計算をスキップ（開いたときだけ算出）
  const diff = useMemo(() => (open ? computeSlidesDiff(beforeText, afterText) : null), [open, beforeText, afterText])

  // 部分適用の選択状態（②・#301）。テーマ・スライド単位のみ選択可能で、初期値は「全て適用」（既定動作の維持）。
  // diff.parseable=false のときは選択UI自体を描画しないため中身は使われないが、型を非 null に保つため空の既定値にする。
  // diff が変わる（開くたび・候補が変わるたび）度にリセットする
  const [selection, setSelection] = useState<DiffSelection>({ theme: true, slideIds: new Set() })
  useEffect(() => {
    if (diff && diff.parseable) setSelection(selectAllChanges(diff))
  }, [diff])

  const toggleTheme = () => setSelection((prev) => ({ ...prev, theme: !prev.theme }))
  const toggleSlideSelected = (id: string) => {
    setSelection((prev) => {
      const slideIds = new Set(prev.slideIds)
      if (slideIds.has(id)) slideIds.delete(id)
      else slideIds.add(id)
      return { ...prev, slideIds }
    })
  }

  const kindLabel = (kind: FieldChange['kind']) => (kind === 'added' ? t('diff.added', '追加') : kind === 'removed' ? t('diff.removed', '削除') : t('diff.changed', '変更'))

  // theme は otherChanges の他フィールドと違い、色・コントラスト比を専用UIで展開表示する（Chip一覧からは除く）
  const themeChange = diff?.otherChanges.find((m) => m.key === 'theme')
  const otherChangesExceptTheme = diff?.otherChanges.filter((m) => m.key !== 'theme') ?? []

  // 色キーごとの比較行。getContrastRatio は DOM 操作を伴うため、theme 変更が無関係な再レンダーでは再計算しない
  const themeColorRows = useMemo(() => {
    const beforeColors: ColorPalette = (themeChange?.before as ThemeData | undefined)?.colors ?? {}
    const afterColors: ColorPalette = (themeChange?.after as ThemeData | undefined)?.colors ?? {}
    const colorKeys = [...new Set([...Object.keys(beforeColors), ...Object.keys(afterColors)])]
    return colorKeys.map((key) => {
      const isTextKey = TEXT_COLOR_KEYS.includes(key)
      return {
        key,
        before: beforeColors[key],
        after: afterColors[key],
        isTextKey,
        ratioBefore: isTextKey ? getContrastRatio(beforeColors[key], beforeColors.background) : null,
        ratioAfter: isTextKey ? getContrastRatio(afterColors[key], afterColors.background) : null,
      }
    })
  }, [themeChange])

  // 追加/削除/変更の本文表示（git diff 風の行単位表示、または before/after 単独ブロック）。スライド・テーマ両方の詳細表示で共通
  const renderChangeBody = (kind: FieldChange['kind'], before: unknown, after: unknown) =>
    kind === 'changed' ? (
      // git diff 風の行単位表示（追加=緑/削除=赤）。左右の全文並列より変更箇所が一目で分かる
      <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, overflow: 'auto', maxHeight: 360, backgroundColor: 'var(--fixed-background-alt)', borderRadius: 1, fontFamily: 'var(--fixed-font-code)' }}>
        {renderLineDiff(before, after)}
      </Box>
    ) : (
      <Box>
        <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
          {kind === 'removed' ? t('diff.before', '変更前') : t('diff.after', '変更後')}
        </Typography>
        <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, overflow: 'auto', maxHeight: 220, backgroundColor: 'var(--fixed-background-alt)', borderRadius: 1, fontFamily: 'var(--fixed-font-code)' }}>
          {jsonBlock(kind === 'removed' ? before : after)}
        </Box>
      </Box>
    )

  // 展開カード（チェックボックス + Chip + タイトル の summary、本文は details/summary 内）。スライド・テーマ両方の詳細表示で共通。
  // checked/onToggle は部分適用の選択（②・#301）。チェックボックスのクリックは <summary> の開閉トグルへ伝播させない
  const renderDetailCard = (key: string, kind: FieldChange['kind'], title: ReactNode, body: ReactNode, checked: boolean, onToggle: () => void) => (
    <Box component="details" key={key} sx={{ border: '1px solid var(--fixed-border)', borderRadius: 1, mb: 0.5, overflow: 'hidden' }}>
      <Box component="summary" sx={{ px: 1, py: 0.75, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } }}>
        <Checkbox size="small" checked={checked} onChange={onToggle} onClick={(e) => e.stopPropagation()} sx={{ p: 0 }} />
        <Chip size="small" color={KIND_COLOR[kind]} label={kindLabel(kind)} />
        {title}
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>{body}</Box>
    </Box>
  )

  const renderThemeDetail = (m: FieldChange) => {
    const body = (
      <>
        {themeColorRows.length > 0 && (
          <Stack spacing={0.5} sx={{ mb: 1 }}>
            {themeColorRows.map(({ key, before, after, isTextKey, ratioBefore, ratioAfter }) => {
              const isAA = ratioAfter !== null && ratioAfter >= WCAG_AA_THRESHOLD
              return (
                <Stack key={key} direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ width: 100, flexShrink: 0, fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
                    {key}
                  </Typography>
                  <ColorSwatch value={before} />
                  <Typography component="span" sx={{ color: 'var(--fixed-text-muted)' }}>
                    →
                  </Typography>
                  <ColorSwatch value={after} />
                  {isTextKey && (
                    <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
                      {t('diff.contrastRatio', 'コントラスト比')}: {formatRatio(ratioBefore)} → {formatRatio(ratioAfter)}
                    </Typography>
                  )}
                  {ratioAfter !== null && <Chip size="small" color={isAA ? 'success' : 'error'} label={isAA ? 'AA ✓' : 'AA ×'} />}
                </Stack>
              )
            })}
          </Stack>
        )}
        {renderChangeBody(m.kind, m.before, m.after)}
      </>
    )
    return renderDetailCard(
      m.key,
      m.kind,
      <Typography component="span" sx={{ fontFamily: 'var(--fixed-font-code)' }}>
        {t('diff.themeSection', 'テーマ')}
      </Typography>,
      body,
      selection.theme,
      toggleTheme,
    )
  }

  const renderSlideDetail = (c: SlideChange) =>
    renderDetailCard(
      c.id,
      c.kind,
      <Typography component="span" sx={{ fontFamily: 'var(--fixed-font-code)' }}>
        {c.id}
      </Typography>,
      renderChangeBody(c.kind, c.before, c.after),
      selection.slideIds.has(c.id),
      () => toggleSlideSelected(c.id),
    )

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth aria-labelledby="generated-diff-title">
      <DialogTitle id="generated-diff-title" sx={{ pb: 0.5 }}>
        {t('diff.title', '生成結果を適用しますか？')}
        <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)', mt: 0.5 }}>
          {t('diff.subtitle', 'AI が生成したスライドを現在の内容と比較します')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <ValidationErrorList errors={validationErrors} sx={{ mb: 1.5 }} />
        {hasValidationErrors && (
          <Typography variant="body2" sx={{ color: 'var(--fixed-primary)', mb: 1.5 }}>
            {t('diff.applyBlocked', '検証エラーが残っているため適用できません。再生成するか、内容を手動で修正してください。')}
          </Typography>
        )}
        {diff && diff.parseable ? (
          <Stack spacing={1.5}>
            {/* 集計サマリ */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ color: 'var(--fixed-text-body)' }}>
                {t('diff.slides', 'スライド')} {diff.beforeCount} → {diff.afterCount}
              </Typography>
              <Chip size="small" color="success" variant="outlined" label={`${t('diff.added', '追加')} ${diff.added}`} />
              <Chip size="small" color="warning" variant="outlined" label={`${t('diff.changed', '変更')} ${diff.changed}`} />
              <Chip size="small" color="error" variant="outlined" label={`${t('diff.removed', '削除')} ${diff.removed}`} />
              <Chip size="small" variant="outlined" label={`${t('diff.meta', 'メタ変更')} ${diff.metaChanges.length}`} />
            </Stack>

            {!hasChanges(diff) && (
              <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
                {t('diff.noChanges', '変更はありません')}
              </Typography>
            )}

            {/* メタ／その他トップレベルの変更（theme は専用UIで下に展開表示するため除く） */}
            {(diff.metaChanges.length > 0 || otherChangesExceptTheme.length > 0) && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {t('diff.metaSection', 'メタ情報')}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {[...diff.metaChanges, ...otherChangesExceptTheme].map((m) => (
                    <Chip key={m.key} size="small" color={KIND_COLOR[m.kind]} variant="outlined" label={`${m.key}: ${kindLabel(m.kind)}`} />
                  ))}
                </Stack>
              </Box>
            )}

            {/* テーマの変更（色・WCAGコントラスト比を展開表示） */}
            {themeChange && <Box>{renderThemeDetail(themeChange)}</Box>}

            {/* スライドの追加/変更/削除（展開で before/after 詳細） */}
            {diff.slideChanges.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {t('diff.slidesSection', 'スライド')}
                </Typography>
                {diff.slideChanges.map(renderSlideDetail)}
              </Box>
            )}
          </Stack>
        ) : afterText ? (
          // フォールバック（構造解析不能）: 全体置換であることを明示し、整形済みの適用後内容を提示。
          // afterText が空（閉じるトランジション中）のときは何も出さず、空フォールバックのちらつきを防ぐ
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('diff.unparseable', '構造を解析できないため、全体を置換します。以下が適用後の内容です。')}
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, overflow: 'auto', maxHeight: 360, backgroundColor: 'var(--fixed-background-alt)', borderRadius: 1, fontFamily: 'var(--fixed-font-code)' }}>
              {prettyPrintJson(afterText)}
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {t('diff.cancel', 'キャンセル')}
        </Button>
        {hasValidationErrors && (
          <Button onClick={onRegenerate} color="inherit">
            {t('diff.regenerate', '再生成する')}
          </Button>
        )}
        <Button onClick={() => onApply(diff && diff.parseable ? selection : null)} variant="contained" disabled={hasValidationErrors}>
          {t('diff.apply', '適用する')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
