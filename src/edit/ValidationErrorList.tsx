import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import { Text } from '@codemirror/state'
import type { ValidationError } from '../data/types'
import { useTranslation } from '../i18n'
import { createErrorLocator } from './jsonPathLocator'

interface ValidationErrorListProps {
  errors: ValidationError[]
  sx?: SxProps<Theme>
  /** ジャンプ用の行番号解決に使う JSON テキスト（省略時は行番号を表示しない） */
  text?: string
  /** 行番号クリック時に呼ばれる。text 省略時、または path に対応する位置が見つからない場合は呼ばれない */
  onJumpToOffset?: (offset: number) => void
}

/**
 * 検証エラー一覧の共通表示（`SlideJsonEditor` / `GeneratedDiffDialog` で共用・#47）。
 * errors が空なら何も描画しない。text/onJumpToOffset が渡された場合のみ行番号を表示し、クリックでジャンプできる（#90）。
 */
export function ValidationErrorList({ errors, sx, text, onJumpToOffset }: ValidationErrorListProps) {
  const { t } = useTranslation()
  // text は errors 件数分パース/走査されうるため、1回だけ解決する locator と行番号ドキュメントを用意する
  const locate = useMemo(() => (text !== undefined ? createErrorLocator(text) : null), [text])
  const doc = useMemo(() => (text !== undefined ? Text.of(text.split('\n')) : null), [text])
  if (errors.length === 0) return null

  return (
    <Box role="alert" sx={{ p: 1, borderRadius: 1, backgroundColor: 'var(--fixed-background-alt)', border: '1px solid var(--fixed-border)', maxHeight: 160, overflow: 'auto', ...sx }}>
      <Typography variant="subtitle2" sx={{ color: 'var(--fixed-primary)', fontWeight: 600 }}>
        {t('edit.validationErrors', '検証エラー')} ({errors.length})
      </Typography>
      {errors.map((err, i) => {
        const offset = locate?.(err.path) ?? null
        const jump = offset !== null && doc && onJumpToOffset ? { offset, line: doc.lineAt(offset).number, onJumpToOffset } : null
        return (
          <Typography key={`${err.path}-${i}`} variant="body2" sx={{ color: 'var(--fixed-text-body)', fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
            {jump && (
              <Link
                component="button"
                type="button"
                onClick={() => jump.onJumpToOffset(jump.offset)}
                sx={{ color: 'var(--fixed-primary)', fontFamily: 'inherit', fontSize: 'inherit' }}
                aria-label={`${t('edit.jumpToLine', '該当行へ移動')} L${jump.line}`}
              >
                L{jump.line}
              </Link>
            )}
            {jump ? ' ' : ''}
            {err.path ? `${err.path}: ` : ''}
            {err.message}
          </Typography>
        )
      })}
    </Box>
  )
}
