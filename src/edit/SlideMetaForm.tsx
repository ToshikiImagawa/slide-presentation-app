import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ColorPalette, PresentationData, PresentationMeta, ThemeData } from '../data/types'
import { useTranslation } from '../i18n'

interface SlideMetaFormProps {
  /** 単一の真実源となる PresentationData（JSON エディタと共有） */
  value: PresentationData
  /** 部分更新の通知。未知キー・自由記述フィールドには触れない（FR-004） */
  onChange: (next: PresentationData) => void
}

/**
 * 型が確定したプレゼンテーション情報（meta）・テーマ（theme）をフォーム編集する（FR-003）。
 * 各更新はスプレッドによる部分更新で、対象外のフィールド（未知キー・customCSS・slides 等）を保持する。
 * 型が確定しない自由記述（未知キー・任意 component props）は JSON エディタ側で扱う。
 */
export function SlideMetaForm({ value, onChange }: SlideMetaFormProps) {
  const { t } = useTranslation()

  // 部分更新（対象フィールド以外は保持 = 無損失）
  const updateMeta = (patch: Partial<PresentationMeta>) => onChange({ ...value, meta: { ...value.meta, ...patch } })
  const updateTheme = (patch: Partial<ThemeData>) => onChange({ ...value, theme: { ...(value.theme ?? {}), ...patch } })
  const updateColors = (patch: Partial<ColorPalette>) => onChange({ ...value, theme: { ...(value.theme ?? {}), colors: { ...(value.theme?.colors ?? {}), ...patch } } })

  const colors = value.theme?.colors ?? {}

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
      <Typography variant="subtitle2" sx={{ color: 'var(--theme-text-heading)', fontWeight: 600 }}>
        {t('edit.metaSection', 'プレゼンテーション情報')}
      </Typography>
      <TextField label={t('edit.metaTitle', 'タイトル')} value={value.meta.title ?? ''} onChange={(e) => updateMeta({ title: e.target.value })} size="small" fullWidth required />
      <TextField label={t('edit.metaDescription', '説明')} value={value.meta.description ?? ''} onChange={(e) => updateMeta({ description: e.target.value })} size="small" fullWidth />
      <TextField label={t('edit.metaAuthor', '発表者')} value={value.meta.author ?? ''} onChange={(e) => updateMeta({ author: e.target.value })} size="small" fullWidth />

      <Typography variant="subtitle2" sx={{ color: 'var(--theme-text-heading)', fontWeight: 600, mt: 1 }}>
        {t('edit.themeSection', 'テーマ')}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <TextField label={t('edit.themePrimary', 'プライマリ色')} value={colors.primary ?? ''} onChange={(e) => updateColors({ primary: e.target.value })} size="small" placeholder="#RRGGBB" />
        <TextField label={t('edit.themeAccent', 'アクセント色')} value={colors.accent ?? ''} onChange={(e) => updateColors({ accent: e.target.value })} size="small" placeholder="#RRGGBB" />
        <TextField label={t('edit.themeBackground', '背景色')} value={colors.background ?? ''} onChange={(e) => updateColors({ background: e.target.value })} size="small" placeholder="#RRGGBB" />
        <TextField label={t('edit.themeText', '文字色')} value={colors.text ?? ''} onChange={(e) => updateColors({ text: e.target.value })} size="small" placeholder="#RRGGBB" />
      </Box>
      <TextField
        label={t('edit.themeCustomCss', 'カスタム CSS')}
        value={value.theme?.customCSS ?? ''}
        onChange={(e) => updateTheme({ customCSS: e.target.value })}
        multiline
        minRows={3}
        size="small"
        fullWidth
        slotProps={{ htmlInput: { style: { fontFamily: 'var(--theme-font-code), monospace', fontSize: 12 } } }}
      />
    </Box>
  )
}
