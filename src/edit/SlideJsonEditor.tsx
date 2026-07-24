import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ValidationError } from '../data/types'
import { useTranslation } from '../i18n'

interface SlideJsonEditorProps {
  /** 現在の JSON テキスト（無損失往復の土台） */
  value: string
  /** テキスト変更通知（親が parseSlides で検証しプレビューへ反映する） */
  onChange: (value: string) => void
  /** 構文・スキーマ検証エラー（parseSlides の結果を外部表示する） */
  errors: ValidationError[]
}

/**
 * slides.json を編集する plain textarea（MUI TextField multiline）。
 * 構文強調ライブラリは持たず、検証は親から渡る errors を外部表示するだけに留める（DC-005 と整合）。
 */
export function SlideJsonEditor({ value, onChange, errors }: SlideJsonEditorProps) {
  const { t } = useTranslation()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 1 }}>
      <TextField
        label={t('edit.jsonLabel', 'slides.json')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        multiline
        minRows={12}
        fullWidth
        spellCheck={false}
        slotProps={{
          htmlInput: {
            'aria-label': t('edit.jsonLabel', 'slides.json'),
            style: { fontFamily: 'var(--theme-font-code), monospace', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre', overflowWrap: 'normal' },
          },
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          // multiline テキストエリアをコンテナ高さいっぱいに固定し、本文は内部でスクロールさせる
          // （自動拡張のままだと枠（notchedOutline）が固定高さのまま本文だけ伸びてズレるため）
          '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch', overflow: 'hidden' },
          '& .MuiInputBase-input': { height: '100% !important', overflow: 'auto !important', resize: 'none' },
        }}
      />
      {errors.length > 0 && (
        <Box role="alert" sx={{ p: 1, borderRadius: 1, backgroundColor: 'var(--theme-background-alt)', border: '1px solid var(--theme-border)', maxHeight: 160, overflow: 'auto', flexShrink: 0 }}>
          <Typography variant="subtitle2" sx={{ color: 'var(--theme-primary)', fontWeight: 600 }}>
            {t('edit.validationErrors', '検証エラー')} ({errors.length})
          </Typography>
          {errors.map((err, i) => (
            <Typography key={`${err.path}-${i}`} variant="body2" sx={{ color: 'var(--theme-text-body)', fontFamily: 'var(--theme-font-code), monospace', fontSize: 12 }}>
              {err.path ? `${err.path}: ` : ''}
              {err.message}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  )
}
