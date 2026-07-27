import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ValidationError } from '../data/types'
import { useTranslation } from '../i18n'

/**
 * 検証エラー一覧の共通表示（`SlideJsonEditor` / `GeneratedDiffDialog` で共用・#47）。
 * errors が空なら何も描画しない。
 */
export function ValidationErrorList({ errors, sx }: { errors: ValidationError[]; sx?: SxProps<Theme> }) {
  const { t } = useTranslation()
  if (errors.length === 0) return null

  return (
    <Box role="alert" sx={{ p: 1, borderRadius: 1, backgroundColor: 'var(--fixed-background-alt)', border: '1px solid var(--fixed-border)', maxHeight: 160, overflow: 'auto', ...sx }}>
      <Typography variant="subtitle2" sx={{ color: 'var(--fixed-primary)', fontWeight: 600 }}>
        {t('edit.validationErrors', '検証エラー')} ({errors.length})
      </Typography>
      {errors.map((err, i) => (
        <Typography key={`${err.path}-${i}`} variant="body2" sx={{ color: 'var(--fixed-text-body)', fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
          {err.path ? `${err.path}: ` : ''}
          {err.message}
        </Typography>
      ))}
    </Box>
  )
}
