import { useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'
import { getContrastRatio, WCAG_AA_THRESHOLD } from '../applyTheme'
import type { LogoConfig, SlideData, ThemeData } from '../data'
import { compile, mediaAssetToDataUrl, mergeCompiledBrandTheme } from '../brand/compile'
import { MAPPED_COLOR_KEYS, type BandCandidate, type BrandFieldStatus, type BrandOverrides, type BrandProfile, type CompiledBrandTheme, type MappedColorKey } from '../brand/types'
import { ColorSwatch } from './GeneratedDiffDialog'
import { SlidePreview } from './SlidePreview'

/** WCAG コントラスト収束の対象キー → 背景キー（表示用。compile.ts の収束対象と同じ組） */
const TEXT_KEY_TO_BACKGROUND_KEY: Partial<Record<MappedColorKey, MappedColorKey>> = { tx1: 'bg1', tx2: 'bg2' }
const HEX_PATTERN = /^#[0-9a-f]{6}$/i

export interface BrandConfirmDialogProps {
  open: boolean
  profile: BrandProfile
  /** 前回保存済みの上書き（同一テンプレートの再取り込み）。初回取り込みは空オブジェクト */
  initialOverrides: BrandOverrides
  /** 右パネルのライブプレビューに使う、現在編集中のスライド 1 枚 */
  previewSlide: SlideData
  previewLogo?: LogoConfig
  /** 現在のデッキのテーマ（既存の masters 等を保持したまま `brand` master だけ上書きしてプレビューする） */
  previewTheme?: ThemeData
  onApply: (result: { overrides: BrandOverrides; compiled: CompiledBrandTheme }) => void
  onCancel: () => void
}

function statusChipColor(status: BrandFieldStatus): 'success' | 'info' | 'warning' | 'default' {
  switch (status) {
    case 'ok':
      return 'success'
    case 'derived':
      return 'info'
    case 'fallback':
      return 'warning'
    case 'missing':
      return 'default'
  }
}

/**
 * ブランド抽出（#167）の並置比較・取り込み確認ダイアログ（#168）。
 *
 * 左にテンプレートの実サムネイル、右に取り込み後の見た目を反映した `SlidePreview` を並置し、
 * 12 キーの行単位 hex 上書きとコントラスト比実測値、ロゴ/帯候補の採否を人が確認してから取り込む。
 * ヒューリスティクス（ロゴ候補ランキング・帯検出）は誤爆しうる前提のため、[取り込む] するまでは
 * `compile` の結果をプレビューに反映するだけで、デッキの実データには一切書き込まない。
 */
export function BrandConfirmDialog({ open, profile, initialOverrides, previewSlide, previewLogo, previewTheme, onApply, onCancel }: BrandConfirmDialogProps) {
  const { t } = useTranslation()
  const [overrides, setOverrides] = useState<BrandOverrides>(initialOverrides)
  const [colorDrafts, setColorDrafts] = useState<Partial<Record<MappedColorKey, string>>>({})

  const { theme: compiled, report } = useMemo(() => compile(profile, overrides), [profile, overrides])

  const previewMergedTheme = useMemo<ThemeData>(() => mergeCompiledBrandTheme(previewTheme, compiled), [previewTheme, compiled])

  const commitColorOverride = (key: MappedColorKey, draft: string) => {
    setColorDrafts((prev) => ({ ...prev, [key]: undefined }))
    if (!HEX_PATTERN.test(draft)) return
    setOverrides((prev) => ({ ...prev, colorHex: { ...prev.colorHex, [key]: draft.toLowerCase() } }))
  }

  const selectLogo = (index: number | null) => {
    setOverrides((prev) => ({ ...prev, selectedLogoIndex: index, manualLogo: undefined }))
  }

  const toggleBand = (index: number, checked: boolean) => {
    setOverrides((prev) => {
      const current = new Set(prev.selectedBandIndices ?? [])
      if (checked) current.add(index)
      else current.delete(index)
      return { ...prev, selectedBandIndices: [...current].sort((a, b) => a - b) }
    })
  }

  const handleApply = () => onApply({ overrides, compiled })

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="lg" fullWidth aria-labelledby="brand-confirm-title">
      <DialogTitle id="brand-confirm-title" sx={{ pb: 0.5 }}>
        {t('brand.title', 'ブランドテーマの取り込み確認')}
        <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)', mt: 0.5 }}>
          {t('brand.subtitle', 'テンプレートと見た目を比較し、必要な項目を上書きしてから取り込みます')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {profile.name ?? t('brand.thumbnailAlt', 'テンプレートのサムネイル')}
            </Typography>
            <Box
              sx={{
                aspectRatio: '16 / 9',
                backgroundColor: 'var(--fixed-background-alt)',
                borderRadius: 1,
                border: '1px solid var(--fixed-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {profile.thumbnail ? (
                <img src={mediaAssetToDataUrl(profile.thumbnail)} alt={t('brand.thumbnailAlt', 'テンプレートのサムネイル')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
                  {t('brand.noThumbnail', 'サムネイルがありません')}
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t('brand.previewLabel', '取り込み後のプレビュー')}
            </Typography>
            <Box sx={{ aspectRatio: '16 / 9', position: 'relative', border: '1px solid var(--fixed-border)', borderRadius: 1, overflow: 'hidden' }}>
              <SlidePreview slide={previewSlide} logo={previewLogo} theme={previewMergedTheme} index={0} total={1} />
            </Box>
          </Box>
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.colorsSection', '色（12キー）')}
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {MAPPED_COLOR_KEYS.map((key) => {
            const bgKey = TEXT_KEY_TO_BACKGROUND_KEY[key]
            const ratio = bgKey ? getContrastRatio(compiled.colors[key], compiled.colors[bgKey]) : null
            const isAA = ratio !== null && ratio >= WCAG_AA_THRESHOLD
            const status = report.fields[`colors.${key}`]?.status
            return (
              <Stack key={key} direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Typography component="span" sx={{ width: 90, flexShrink: 0, fontFamily: 'var(--fixed-font-code)', fontSize: 12 }}>
                  {key}
                </Typography>
                <ColorSwatch value={compiled.colors[key]} />
                <TextField
                  size="small"
                  value={colorDrafts[key] ?? overrides.colorHex?.[key] ?? compiled.colors[key]}
                  onChange={(e) => setColorDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={(e) => commitColorOverride(key, e.target.value)}
                  inputProps={{ 'aria-label': `${key} hex`, style: { fontFamily: 'var(--fixed-font-code)', fontSize: 12, padding: '4px 8px' } }}
                  sx={{ width: 110 }}
                />
                {status && <Chip size="small" color={statusChipColor(status)} label={t(`brand.status${capitalize(status)}`, status)} />}
                {ratio !== null && (
                  <>
                    <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
                      {t('diff.contrastRatio', 'コントラスト比')}: {ratio.toFixed(2)}:1
                    </Typography>
                    <Chip size="small" color={isAA ? 'success' : 'error'} label={isAA ? 'AA ✓' : 'AA ×'} />
                  </>
                )}
              </Stack>
            )
          })}
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.logoSection', 'ロゴ')}
        </Typography>
        <RadioGroup
          sx={{ mb: 2 }}
          value={overrides.manualLogo === null ? 'none' : overrides.selectedLogoIndex != null ? String(overrides.selectedLogoIndex) : 'none'}
          onChange={(e) => selectLogo(e.target.value === 'none' ? null : Number(e.target.value))}
        >
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <FormControlLabel value="none" control={<Radio size="small" />} label={t('brand.logoNone', 'ロゴなし')} />
            {profile.logoCandidates.map((candidate, i) => (
              <FormControlLabel
                key={i}
                value={String(i)}
                control={<Radio size="small" />}
                label={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box
                      component="img"
                      src={mediaAssetToDataUrl(candidate.image)}
                      alt={candidate.nameHint ?? `logo-${i}`}
                      sx={{ height: 24, maxWidth: 80, objectFit: 'contain', border: '1px solid var(--fixed-border)', borderRadius: '2px' }}
                    />
                    <Typography component="span" sx={{ fontSize: 12 }}>
                      {candidate.nameHint ?? `#${i + 1}`}
                    </Typography>
                  </Stack>
                }
              />
            ))}
          </Stack>
        </RadioGroup>

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.bandsSection', '帯')}
        </Typography>
        {profile.bandCandidates.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)', mb: 2 }}>
            {t('brand.noBandCandidates', '帯は検出されませんでした')}
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {profile.bandCandidates.map((band: BandCandidate, i) => (
              <FormControlLabel
                key={i}
                control={<Checkbox size="small" checked={(overrides.selectedBandIndices ?? []).includes(i)} onChange={(e) => toggleBand(i, e.target.checked)} />}
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ColorSwatch value={band.colorHex} />
                    <Typography component="span" sx={{ fontSize: 12 }}>
                      {band.anchor} / {band.orientation}
                    </Typography>
                  </Stack>
                }
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {t('diff.cancel', 'キャンセル')}
        </Button>
        <Button onClick={handleApply} variant="contained">
          {t('brand.apply', '取り込む')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
