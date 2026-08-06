import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { ALLOWED_LAYOUTS } from '../data/slideContentSchema'
import type { ColorPalette, PresentationData, PresentationMeta, ThemeData } from '../data/types'
import { useTranslation } from '../i18n'

/** masterKey を選ぶセレクト（「なし」相当の空値 + masterKeys 一覧）。theme.masterMap 用・slide.meta.master 用の両方で使う */
function MasterKeySelect({ value, masterKeys, noneLabel, ariaLabel, onChange }: { value: string; masterKeys: string[]; noneLabel: ReactNode; ariaLabel: string; onChange: (masterKey: string) => void }) {
  return (
    <FormControl size="small" fullWidth>
      <Select value={value} onChange={(e) => onChange(e.target.value)} displayEmpty SelectDisplayProps={{ 'aria-label': ariaLabel }}>
        <MenuItem value="">
          <em>{noneLabel}</em>
        </MenuItem>
        {masterKeys.map((key) => (
          <MenuItem key={key} value={key}>
            {key}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

interface SlideMetaFormProps {
  /** 単一の真実源となる PresentationData（JSON エディタと共有） */
  value: PresentationData
  /** 部分更新の通知。未知キー・自由記述フィールドには触れない（FR-004） */
  onChange: (next: PresentationData) => void
  /** 「プレゼンテーション情報」と「テーマ」の間に差し込む要素（ブランドテーマ取り込み導線など） */
  themeSectionSlot?: ReactNode
  /** プレビュー中のスライド index。指定時のみ「このスライドのマスター」（slide.meta.master）を編集できる（#185） */
  currentSlideIndex?: number
}

/**
 * 型が確定したプレゼンテーション情報（meta）・テーマ（theme）をフォーム編集する（FR-003）。
 * 各更新はスプレッドによる部分更新で、対象外のフィールド（未知キー・customCSS・slides 等）を保持する。
 * 型が確定しない自由記述（未知キー・任意 component props）は JSON エディタ側で扱う。
 */
export function SlideMetaForm({ value, onChange, themeSectionSlot, currentSlideIndex }: SlideMetaFormProps) {
  const { t } = useTranslation()

  // 部分更新（対象フィールド以外は保持 = 無損失）
  const updateMeta = (patch: Partial<PresentationMeta>) => onChange({ ...value, meta: { ...value.meta, ...patch } })
  const updateTheme = (patch: Partial<ThemeData>) => onChange({ ...value, theme: { ...(value.theme ?? {}), ...patch } })
  const updateColors = (patch: Partial<ColorPalette>) => onChange({ ...value, theme: { ...(value.theme ?? {}), colors: { ...(value.theme?.colors ?? {}), ...patch } } })
  const updateMasterMap = (layout: string, masterKey: string) => {
    const nextMasterMap = { ...(value.theme?.masterMap ?? {}) }
    if (masterKey) nextMasterMap[layout] = masterKey
    else delete nextMasterMap[layout]
    onChange({ ...value, theme: { ...(value.theme ?? {}), masterMap: nextMasterMap } })
  }
  const colors = value.theme?.colors ?? {}
  const masterKeys = Object.keys(value.theme?.masters ?? {})
  const currentSlide = currentSlideIndex !== undefined ? value.slides[currentSlideIndex] : undefined

  // slide.meta.master を更新する（masterMap 解決より優先されるスライド個別指定・#185）。他の meta フィールドは保持する
  const updateSlideMaster = (masterKey: string) => {
    if (!currentSlide) return
    const nextSlides = value.slides.map((slide, i) => {
      if (i !== currentSlideIndex) return slide
      const nextMeta = { ...slide.meta }
      if (masterKey) nextMeta.master = masterKey
      else delete nextMeta.master
      return { ...slide, meta: nextMeta }
    })
    onChange({ ...value, slides: nextSlides })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
      <Typography variant="subtitle2" sx={{ color: 'var(--fixed-text-heading)', fontWeight: 600 }}>
        {t('edit.metaSection', 'プレゼンテーション情報')}
      </Typography>
      <TextField label={t('edit.metaTitle', 'タイトル')} value={value.meta.title ?? ''} onChange={(e) => updateMeta({ title: e.target.value })} size="small" fullWidth required />
      <TextField label={t('edit.metaDescription', '説明')} value={value.meta.description ?? ''} onChange={(e) => updateMeta({ description: e.target.value })} size="small" fullWidth />
      <TextField label={t('edit.metaAuthor', '発表者')} value={value.meta.author ?? ''} onChange={(e) => updateMeta({ author: e.target.value })} size="small" fullWidth />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
        <Typography variant="subtitle2" sx={{ color: 'var(--fixed-text-heading)', fontWeight: 600 }}>
          {t('edit.themeSection', 'テーマ')}
        </Typography>
        {themeSectionSlot}
      </Box>
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
        slotProps={{ htmlInput: { style: { fontFamily: 'var(--fixed-font-code)', fontSize: 12 } } }}
      />

      <Typography variant="subtitle2" sx={{ color: 'var(--fixed-text-heading)', fontWeight: 600, mt: 1 }}>
        {t('edit.masterSection', 'マスター')}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, alignItems: 'center' }}>
        {ALLOWED_LAYOUTS.map((layout) => (
          <Box key={layout} sx={{ display: 'contents' }}>
            <Typography component="span" sx={{ fontFamily: 'var(--fixed-font-code)', fontSize: 13 }}>
              {layout}
            </Typography>
            <MasterKeySelect
              value={value.theme?.masterMap?.[layout] ?? ''}
              masterKeys={masterKeys}
              noneLabel={t('edit.masterNone', 'なし')}
              ariaLabel={`${t('edit.masterSection', 'マスター')}: ${layout}`}
              onChange={(key) => updateMasterMap(layout, key)}
            />
          </Box>
        ))}
      </Box>

      {currentSlide && (
        <>
          <Typography variant="subtitle2" sx={{ color: 'var(--fixed-text-heading)', fontWeight: 600, mt: 1 }}>
            {t('edit.slideMasterLabel', 'このスライドのマスター')}
          </Typography>
          <MasterKeySelect
            value={currentSlide.meta?.master ?? ''}
            masterKeys={masterKeys}
            noneLabel={t('edit.slideMasterNone', 'テーマ設定に従う')}
            ariaLabel={t('edit.slideMasterLabel', 'このスライドのマスター')}
            onChange={updateSlideMaster}
          />
        </>
      )}
    </Box>
  )
}
