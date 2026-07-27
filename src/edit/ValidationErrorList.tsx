import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ValidationError } from '../data/types'
import { useTranslation } from '../i18n'
import { locateErrorOffset } from './jsonPathLocator'

interface ValidationErrorListProps {
  errors: ValidationError[]
  sx?: SxProps<Theme>
  /** ジャンプ用の行番号解決に使う JSON テキスト（省略時は行番号を表示しない） */
  text?: string
  /** 行番号クリック時に呼ばれる。text 省略時、または path に対応する位置が見つからない場合は呼ばれない */
  onJumpToOffset?: (offset: number) => void
}

/** offset より前にある改行の数から 1-indexed の行番号を求める */
function lineNumberAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

/**
 * 検証エラー一覧の共通表示（`SlideJsonEditor` / `GeneratedDiffDialog` で共用・#47）。
 * errors が空なら何も描画しない。text/onJumpToOffset が渡された場合のみ行番号を表示し、クリックでジャンプできる（#90）。
 */
export function ValidationErrorList({ errors, sx, text, onJumpToOffset }: ValidationErrorListProps) {
  const { t } = useTranslation()
  if (errors.length === 0) return null

  return (
    <Box role="alert" sx={{ p: 1, borderRadius: 1, backgroundColor: 'var(--fixed-background-alt)', border: '1px solid var(--fixed-border)', maxHeight: 160, overflow: 'auto', ...sx }}>
      <Typography variant="subtitle2" sx={{ color: 'var(--fixed-primary)', fontWeight: 600 }}>
        {t('edit.validationErrors', '検証エラー')} ({errors.length})
      </Typography>
      {errors.map((err, i) => {
        const offset = text !== undefined ? locateErrorOffset(text, err.path) : null
        const line = offset !== null ? lineNumberAt(text!, offset) : null
        return (
          <Typography key={`${err.path}-${i}`} variant="body2" sx={{ color: 'var(--fixed-text-body)', fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
            {line !== null && onJumpToOffset ? (
              <Link component="button" type="button" onClick={() => onJumpToOffset(offset!)} sx={{ color: 'var(--fixed-primary)', fontFamily: 'inherit', fontSize: 'inherit' }} aria-label={`${t('edit.jumpToLine', '該当行へ移動')} L${line}`}>
                L{line}
              </Link>
            ) : null}
            {line !== null && onJumpToOffset ? ' ' : ''}
            {err.path ? `${err.path}: ` : ''}
            {err.message}
          </Typography>
        )
      })}
    </Box>
  )
}
