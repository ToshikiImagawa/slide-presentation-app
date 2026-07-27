import { useMemo } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'
import type { ValidationError } from '../data/types'
import { computeSlidesDiff, hasChanges, type FieldChange, type SlideChange } from './slidesDiff'
import { prettyPrintJson } from './slidesSerialize'
import { ValidationErrorList } from './ValidationErrorList'

/**
 * AI 生成結果を器へ適用する前の確認ダイアログ（①・案3「構造サマリ」）。
 *
 * before（現在の器のテキスト）と after（生成候補）の**構造差分**を、スライド単位の
 * 追加/変更/削除とメタ変更のサマリで見せ、各項目は展開して before/after の詳細を確認できる。
 * 構造解析不能（構文不正・id 欠落/重複）のときは「全体置換」のフォールバック表示にする。
 * [適用する] で `onApply`（器のテキストを整形して全体置換）、[キャンセル] で `onCancel`（器に触れない・FR-008）。
 */
export interface GeneratedDiffDialogProps {
  open: boolean
  /** 現在の器のテキスト（変更前） */
  beforeText: string
  /** 適用候補の生成テキスト（変更後） */
  afterText: string
  /** 適用候補に残る検証エラー（自動修正の上限到達＝exhausted で非空になりうる・#47） */
  validationErrors: ValidationError[]
  onApply: () => void
  onCancel: () => void
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

export function GeneratedDiffDialog({ open, beforeText, afterText, validationErrors, onApply, onCancel }: GeneratedDiffDialogProps) {
  const { t } = useTranslation()
  // 閉じているときは差分計算をスキップ（開いたときだけ算出）
  const diff = useMemo(() => (open ? computeSlidesDiff(beforeText, afterText) : null), [open, beforeText, afterText])

  const kindLabel = (kind: FieldChange['kind']) => (kind === 'added' ? t('diff.added', '追加') : kind === 'removed' ? t('diff.removed', '削除') : t('diff.changed', '変更'))

  const renderSlideDetail = (c: SlideChange) => (
    <Box component="details" key={c.id} sx={{ border: '1px solid var(--fixed-border)', borderRadius: 1, mb: 0.5, overflow: 'hidden' }}>
      <Box component="summary" sx={{ px: 1, py: 0.75, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } }}>
        <Chip size="small" color={KIND_COLOR[c.kind]} label={kindLabel(c.kind)} />
        <Typography component="span" sx={{ fontFamily: 'var(--fixed-font-code)' }}>
          {c.id}
        </Typography>
      </Box>
      <Box sx={{ px: 1, pb: 1, display: 'grid', gap: 1, gridTemplateColumns: c.kind === 'changed' ? '1fr 1fr' : '1fr' }}>
        {c.before !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('diff.before', '変更前')}
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, overflow: 'auto', maxHeight: 220, backgroundColor: 'var(--fixed-background-alt)', borderRadius: 1, fontFamily: 'var(--fixed-font-code)' }}>
              {jsonBlock(c.before)}
            </Box>
          </Box>
        )}
        {c.after !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('diff.after', '変更後')}
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, overflow: 'auto', maxHeight: 220, backgroundColor: 'var(--fixed-background-alt)', borderRadius: 1, fontFamily: 'var(--fixed-font-code)' }}>
              {jsonBlock(c.after)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
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

            {/* メタ／その他トップレベルの変更 */}
            {(diff.metaChanges.length > 0 || diff.otherChanges.length > 0) && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {t('diff.metaSection', 'メタ情報')}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {[...diff.metaChanges, ...diff.otherChanges].map((m) => (
                    <Chip key={m.key} size="small" color={KIND_COLOR[m.kind]} variant="outlined" label={`${m.key}: ${kindLabel(m.kind)}`} />
                  ))}
                </Stack>
              </Box>
            )}

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
        <Button onClick={onApply} variant="contained">
          {t('diff.apply', '適用する')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
