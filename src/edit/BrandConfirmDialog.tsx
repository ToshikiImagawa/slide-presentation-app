import { useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'
import { getContrastRatio, WCAG_AA_THRESHOLD } from '../applyTheme'
import type { LogoConfig, SafeArea, SlideData, ThemeData } from '../data'
import { compile, mediaAssetToDataUrl, mergeCompiledBrandTheme } from '../brand/compile'
import {
  LAYOUT_ASSIGNMENT_SLOTS,
  MAPPED_COLOR_KEYS,
  type BandCandidate,
  type BrandColorScheme,
  type BrandFieldStatus,
  type BrandOverrides,
  type BrandProfile,
  type CompiledBrandTheme,
  type LayoutAssignmentSlot,
  type MappedColorKey,
} from '../brand/types'
import { resolveCanvasSize } from '../hooks/useReveal'
import { ColorSwatch } from './GeneratedDiffDialog'
import { SlidePreview } from './SlidePreview'

/** WCAG コントラスト収束の対象キー → 背景キー（表示用。compile.ts の収束対象と同じ組） */
const TEXT_KEY_TO_BACKGROUND_KEY: Partial<Record<MappedColorKey, MappedColorKey>> = { tx1: 'bg1', tx2: 'bg2' }
const HEX_PATTERN = /^#[0-9a-f]{6}$/i

/** 型階層の段（`fonts.fontSizeRatios` のキー）の表示ラベル（#316。`compile.ts` の
 * `SLOT_TO_FONT_SIZE_STEP` と対応）。既定比率にしかないキー（subtitle1 等）を人が上書きした場合は
 * キー名をそのまま見せる。#332 では `t()` 化の対象外とし、locale 化は #338 へ切り出した */
const FONT_SIZE_STEP_LABELS: Record<string, string> = { h1: '表紙タイトル', h2: '章タイトル', h3: '本文見出し' }

/** 書体名の上書きキー（`BrandOverrides.fontOverrides` のうち文字列のスロット。#316） */
type FontNameOverrideKey = 'heading' | 'headingEa' | 'body' | 'bodyEa'

/** 書体スロットの行定義（見出し / 本文）。値は `compile` の決定結果から読むため、キーだけを持つ静的な表 */
const FONT_SLOT_ROWS = [
  { slot: 'heading', labelFallback: '見出し', latinKey: 'heading', eaKey: 'headingEa' },
  { slot: 'body', labelFallback: '本文', latinKey: 'body', eaKey: 'bodyEa' },
] as const satisfies ReadonlyArray<{ slot: 'heading' | 'body'; labelFallback: string; latinKey: FontNameOverrideKey; eaKey: FontNameOverrideKey }>

/** 数値入力の検証（型階層の基準サイズ・段の比率で共有）。
 * 空欄は「上書きを解除する」意図として `null`、0 以下や数値でない入力は「コミットしない」意図として `undefined` */
function parsePositiveNumber(draft: string): number | null | undefined {
  if (draft.trim() === '') return null
  const value = Number.parseFloat(draft)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** セーフエリア（#317）の数値入力の検証。余白は 0（本文をキャンバス端まで広げる）を許すため
 * `parsePositiveNumber` と異なり 0 以上を有効値とする */
function parseNonNegativeNumber(draft: string): number | null | undefined {
  if (draft.trim() === '') return null
  const value = Number.parseFloat(draft)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/** セーフエリア4辺の表示順とラベル（#317） */
const SAFE_AREA_ROWS: ReadonlyArray<{ key: keyof SafeArea; labelFallback: string }> = [
  { key: 'top', labelFallback: '上' },
  { key: 'right', labelFallback: '右' },
  { key: 'bottom', labelFallback: '下' },
  { key: 'left', labelFallback: '左' },
]

/** 割り当て可能な7枠の表示ラベル（`LAYOUT_ASSIGNMENT_SLOTS` の並び順。#185/#192 で5枠固定、#262 で反転面/締めの2枠を追加）。
 * #332 では `t()` 化の対象外とし、locale 化は #338 へ切り出した */
const LAYOUT_SLOT_LABELS: Record<LayoutAssignmentSlot, string> = {
  center: 'タイトル',
  'center/section': 'タイトル（セクション）',
  'center/message-inverse': '大メッセージ（全面塗り）',
  'center/closing': '締め',
  content: '本文',
  'two-column': '2カラム',
  bleed: '全面',
}

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
  /** 書体名の編集途中の文字列。確定は blur（1 文字ごとに `compile` とプレビューを作り直さないため。色と同じ扱い） */
  const [fontDrafts, setFontDrafts] = useState<Record<string, string | undefined>>({})
  /** 基準サイズと段の比率の編集途中の文字列。確定は blur（不正値はコミットしない） */
  const [baseFontSizeDraft, setBaseFontSizeDraft] = useState<string | undefined>(undefined)
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string | undefined>>({})
  /** セーフエリア4辺の編集途中の文字列（#317。確定は blur） */
  const [safeAreaDrafts, setSafeAreaDrafts] = useState<Partial<Record<keyof SafeArea, string>>>({})

  const { theme: compiled, report } = useMemo(() => compile(profile, overrides), [profile, overrides])

  const previewMergedTheme = useMemo<ThemeData>(() => mergeCompiledBrandTheme(previewTheme, compiled), [previewTheme, compiled])
  const previewCanvasSize = resolveCanvasSize(previewMergedTheme.canvas)
  const previewAspectRatio = previewCanvasSize.width / previewCanvasSize.height

  const commitColorOverride = (key: MappedColorKey, draft: string) => {
    setColorDrafts((prev) => ({ ...prev, [key]: undefined }))
    if (!HEX_PATTERN.test(draft)) return
    setOverrides((prev) => ({ ...prev, colorHex: { ...prev.colorHex, [key]: draft.toLowerCase() } }))
  }

  const setFontOverride = (patch: Partial<NonNullable<BrandOverrides['fontOverrides']>>) => {
    setOverrides((prev) => ({ ...prev, fontOverrides: { ...prev.fontOverrides, ...patch } }))
  }

  const commitFontName = (key: FontNameOverrideKey, draft: string) => {
    setFontDrafts((prev) => ({ ...prev, [key]: undefined }))
    setFontOverride({ [key]: draft.trim() || undefined })
  }

  const commitBaseFontSize = (draft: string) => {
    setBaseFontSizeDraft(undefined)
    const value = parsePositiveNumber(draft)
    if (value !== undefined) setFontOverride({ baseFontSize: value ?? undefined })
  }

  const commitFontSizeRatio = (key: string, draft: string) => {
    setRatioDrafts((prev) => ({ ...prev, [key]: undefined }))
    const value = parsePositiveNumber(draft)
    if (value === undefined) return
    setOverrides((prev) => {
      const ratios = { ...prev.fontOverrides?.fontSizeRatios }
      if (value === null) delete ratios[key]
      else ratios[key] = value
      return { ...prev, fontOverrides: { ...prev.fontOverrides, fontSizeRatios: ratios } }
    })
  }

  const commitSafeArea = (key: keyof SafeArea, draft: string) => {
    setSafeAreaDrafts((prev) => ({ ...prev, [key]: undefined }))
    const value = parseNonNegativeNumber(draft)
    if (value === undefined) return
    setOverrides((prev) => {
      const next = { ...prev.safeAreaOverrides }
      if (value === null) delete next[key]
      else next[key] = value
      return { ...prev, safeAreaOverrides: next }
    })
  }

  const selectMaster = (index: number) => {
    setOverrides((prev) => ({ ...prev, selectedMasterIndex: index }))
  }

  const selectColorScheme = (scheme: BrandColorScheme) => {
    setOverrides((prev) => ({ ...prev, colorScheme: scheme }))
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

  /** `key` は `"<masterIndex>:<layoutIndex>"`（`profile.masters` の添字）。空文字は「未割当」への戻しを表す */
  const assignLayout = (key: string, slot: string) => {
    setOverrides((prev) => {
      const next = { ...prev.layoutAssignments }
      if (slot) next[key] = slot as LayoutAssignmentSlot
      else delete next[key]
      return { ...prev, layoutAssignments: next }
    })
  }

  const handleApply = () => onApply({ overrides, compiled })

  /** 表示する型階層の段。`compiled.fonts.fontSizeRatios` は抽出値と人の上書きを合成済み */
  const fontSizeStepKeys = Object.keys(compiled.fonts.fontSizeRatios ?? {}).sort()

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
            <Box sx={{ aspectRatio: previewAspectRatio, position: 'relative', border: '1px solid var(--fixed-border)', borderRadius: 1, overflow: 'hidden' }}>
              {/* 単票のサンプル1枚なので章はない（sections は空配列） */}
              <SlidePreview slide={previewSlide} logo={previewLogo} theme={previewMergedTheme} index={0} total={1} sections={[]} />
            </Box>
          </Box>
        </Stack>

        {profile.masters.length > 1 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t('brand.masterSection', '基準にするマスター')}
            </Typography>
            <FormControl size="small" sx={{ mb: 2, minWidth: 240 }}>
              <Select value={String(overrides.selectedMasterIndex ?? 0)} onChange={(e) => selectMaster(Number(e.target.value))} SelectDisplayProps={{ 'aria-label': t('brand.masterSection', '基準にするマスター') }}>
                {profile.masters.map((master, i) => (
                  <MenuItem key={master.part} value={String(i)}>
                    {t('brand.masterLabel', 'マスター')} {i + 1}（{master.part}）
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.colorSchemeSection', 'ライト/ダーク')}
        </Typography>
        <RadioGroup row sx={{ mb: 2 }} value={overrides.colorScheme ?? 'auto'} onChange={(e) => selectColorScheme(e.target.value as BrandColorScheme)}>
          <FormControlLabel value="auto" control={<Radio size="small" />} label={t('brand.colorSchemeAuto', '自動（テンプレート通り）')} />
          <FormControlLabel value="light" control={<Radio size="small" />} label={t('brand.colorSchemeLight', 'ライト')} />
          <FormControlLabel value="dark" control={<Radio size="small" />} label={t('brand.colorSchemeDark', 'ダーク')} />
        </RadioGroup>

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
          {t('brand.fontsSection', '書体と型階層')}
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {FONT_SLOT_ROWS.map(({ slot, labelFallback, latinKey, eaKey }) => {
            const label = t(`brand.font${capitalize(slot)}`, labelFallback)
            const field = report.fields[`fonts.${slot}`]
            const spec = compiled.fonts[slot]
            return (
              <Stack key={slot} direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Typography component="span" sx={{ width: 90, flexShrink: 0, fontSize: 12 }}>
                  {label}
                </Typography>
                <TextField
                  size="small"
                  value={fontDrafts[latinKey] ?? spec?.latin ?? ''}
                  onChange={(e) => setFontDrafts((prev) => ({ ...prev, [latinKey]: e.target.value }))}
                  onBlur={(e) => commitFontName(latinKey, e.target.value)}
                  placeholder={t('brand.fontLatin', '欧文')}
                  inputProps={{ 'aria-label': `${label}${t('brand.fontLatinSuffix', '書体（欧文）')}`, style: { fontSize: 12, padding: '4px 8px' } }}
                  sx={{ width: 160 }}
                />
                <TextField
                  size="small"
                  value={fontDrafts[eaKey] ?? spec?.ea ?? ''}
                  onChange={(e) => setFontDrafts((prev) => ({ ...prev, [eaKey]: e.target.value }))}
                  onBlur={(e) => commitFontName(eaKey, e.target.value)}
                  placeholder={t('brand.fontEa', '和文')}
                  inputProps={{ 'aria-label': `${label}${t('brand.fontEaSuffix', '書体（和文）')}`, style: { fontSize: 12, padding: '4px 8px' } }}
                  sx={{ width: 160 }}
                />
                {field && <Chip size="small" color={statusChipColor(field.status)} label={t(`brand.status${capitalize(field.status)}`, field.status)} />}
                {field?.detail && (
                  <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
                    {field.detail}
                  </Typography>
                )}
              </Stack>
            )
          })}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography component="span" sx={{ width: 90, flexShrink: 0, fontSize: 12 }}>
              {t('brand.fontBaseSize', '基準サイズ')}
            </Typography>
            <TextField
              size="small"
              value={baseFontSizeDraft ?? String(compiled.fonts.baseFontSize ?? '')}
              onChange={(e) => setBaseFontSizeDraft(e.target.value)}
              onBlur={(e) => commitBaseFontSize(e.target.value)}
              inputProps={{ 'aria-label': t('brand.fontBaseSizeLabel', '基準サイズ（px）'), style: { fontFamily: 'var(--fixed-font-code)', fontSize: 12, padding: '4px 8px' } }}
              sx={{ width: 80 }}
            />
            <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
              px
            </Typography>
            {fontSizeStepKeys.length === 0 ? (
              <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
                {t('brand.noFontSizeSteps', '型階層は検出されませんでした')}
              </Typography>
            ) : (
              fontSizeStepKeys.map((key) => (
                <Stack key={key} direction="row" spacing={0.5} alignItems="center">
                  <Typography component="span" sx={{ fontSize: 12 }}>
                    {FONT_SIZE_STEP_LABELS[key] ?? key}
                  </Typography>
                  <TextField
                    size="small"
                    value={ratioDrafts[key] ?? String(compiled.fonts.fontSizeRatios?.[key] ?? '')}
                    onChange={(e) => setRatioDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    onBlur={(e) => commitFontSizeRatio(key, e.target.value)}
                    inputProps={{ 'aria-label': `${t('brand.fontSizeStep', '型階層')} ${key}`, style: { fontFamily: 'var(--fixed-font-code)', fontSize: 12, padding: '4px 8px' } }}
                    sx={{ width: 70 }}
                  />
                </Stack>
              ))
            )}
          </Stack>
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

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.layoutsSection', 'レイアウトの割り当て')}
        </Typography>
        {profile.masters.every((master) => master.slideLayouts.length === 0) ? (
          <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)', mb: 2 }}>
            {t('brand.noSlideLayouts', 'レイアウトは検出されませんでした')}
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {profile.masters.map((master, masterIndex) =>
              master.slideLayouts.map((layout, layoutIndex) => {
                const key = `${masterIndex}:${layoutIndex}`
                return (
                  <Stack key={key} direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <Typography component="span" sx={{ width: 80, flexShrink: 0, color: 'var(--fixed-text-muted)', fontSize: 12 }}>
                      {t('brand.masterLabel', 'マスター')} {masterIndex + 1}
                    </Typography>
                    <Typography component="span" sx={{ minWidth: 120, fontSize: 13 }}>
                      {layout.name ?? layout.part}
                    </Typography>
                    {layout.layoutType && <Chip size="small" variant="outlined" label={layout.layoutType} />}
                    <ColorSwatch value={layout.backgroundColorHex ?? undefined} />
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <Select
                        value={overrides.layoutAssignments?.[key] ?? ''}
                        onChange={(e) => assignLayout(key, e.target.value)}
                        displayEmpty
                        SelectDisplayProps={{ 'aria-label': `${t('brand.layoutsSection', 'レイアウトの割り当て')}: ${layout.name ?? layout.part}` }}
                      >
                        <MenuItem value="">
                          <em>{t('brand.layoutSlotNone', '未割当')}</em>
                        </MenuItem>
                        {LAYOUT_ASSIGNMENT_SLOTS.map((slot) => (
                          <MenuItem key={slot} value={slot}>
                            {LAYOUT_SLOT_LABELS[slot]}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                )
              }),
            )}
          </Stack>
        )}

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('brand.safeAreaSection', 'セーフエリア（本文の余白）')}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
          {SAFE_AREA_ROWS.map(({ key, labelFallback }) => (
            <Stack key={key} direction="row" spacing={0.5} alignItems="center">
              <Typography component="span" sx={{ fontSize: 12 }}>
                {t(`brand.safeArea${capitalize(key)}`, labelFallback)}
              </Typography>
              <TextField
                size="small"
                value={safeAreaDrafts[key] ?? String(compiled.canvas?.safeArea?.[key] ?? '')}
                onChange={(e) => setSafeAreaDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={(e) => commitSafeArea(key, e.target.value)}
                placeholder="60"
                inputProps={{ 'aria-label': t(`brand.safeArea${capitalize(key)}Label`, `セーフエリア ${labelFallback}`), style: { fontFamily: 'var(--fixed-font-code)', fontSize: 12, padding: '4px 8px' } }}
                sx={{ width: 70 }}
              />
            </Stack>
          ))}
          <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
            px
          </Typography>
          {report.fields['canvas.safeArea'] && (
            <Chip size="small" color={statusChipColor(report.fields['canvas.safeArea'].status)} label={t(`brand.status${capitalize(report.fields['canvas.safeArea'].status)}`, report.fields['canvas.safeArea'].status)} />
          )}
          {report.fields['canvas.safeArea']?.detail && (
            <Typography component="span" sx={{ color: 'var(--fixed-text-muted)', fontSize: 12 }}>
              {report.fields['canvas.safeArea'].detail}
            </Typography>
          )}
        </Stack>
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
