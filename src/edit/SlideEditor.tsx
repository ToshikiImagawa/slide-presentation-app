import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { editorUiTheme, theme } from '../theme'
import { useTranslation } from '../i18n'
import { applyPresentationTheme, fetchColorPalette, mergeThemeData } from '../applyTheme'
import { getPackageAddonNames, resolveBrandTheme, resolveLocalAssetPaths } from '../localSlideLoader'
import { slugify } from '../slugify'
import { resolveCanvasSize } from '../hooks/useReveal'
import type { ColorPalette, PresentationData, SlideData, ThemeData } from '../data'
import type { GeneratedCandidate } from '../aiGenerate'
import { pickBrandTemplate, loadBrandOverrides, saveBrandOverrides } from '../brand/io'
import { mergeCompiledBrandTheme } from '../brand/compile'
import type { BrandOverrides, BrandProfile, CompiledBrandTheme } from '../brand/types'
import { delegateThemeColors } from '../brandMigration'
import { parseSlides, serializeSlides, prettyPrintJson } from './slidesSerialize'
import { AiGeneratePanel } from './AiGeneratePanel'
import { BrandConfirmDialog } from './BrandConfirmDialog'
import { GeneratedDiffDialog } from './GeneratedDiffDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { SlideJsonEditor } from './SlideJsonEditor'
import { SlideMetaForm } from './SlideMetaForm'
import { SlidePreview } from './SlidePreview'
import { ThemeColorsMigrationNotice } from './ThemeColorsMigrationNotice'
import { addBuiltinAddon, buildBuiltinAddons, chooseExportDir, chooseSlidesSavePath, exportSlidePackage, listBuiltinAddons, listBuiltinDistAddons, removeBuiltinAddon, saveSlidesJson } from '../editModeSave'
import { isTypingTarget } from '../keyboardTarget'
import { SettingsButton } from '../components/SettingsButton'

/** 編集対象データの供給元。相対パスの生 JSON を土台にし、プレビューだけ baseDir 基準でアセット解決する */
export interface EditSource {
  /** 書換前の元 slides.json テキスト（相対アセットパス） */
  rawText: string
  /** 相対アセットの基準ディレクトリ。サンプル/新規など無い場合は空文字 */
  baseDir: string
  /** 保存ダイアログの初期パス（読込元）。サンプル/新規は undefined */
  sourcePath?: string
  /** パッケージ package.json 由来の書き出しパッケージ名（@slides/ を除いた name 部分）。無い場合は meta.title から自動生成する */
  packageName?: string | null
  /** パッケージ package.json 由来のバージョン。無い場合は DEFAULT_VERSION を初期値にする */
  packageVersion?: string | null
  /** AI 生成パネルを開いた状態で編集を開始するか（ホーム画面の「AIで新規作成」導線から遷移した場合のみ true） */
  aiPanelExpanded?: boolean
}

type StatusState = { kind: 'idle' | 'ok' | 'error'; message: string }

const DEFAULT_VERSION = '1.0.0'

/** パッケージ名（@slides/{name} の name 部分）を検証する。npm パッケージ名の規則
 * （小文字英数字・ハイフン・アンダースコアのみ・先頭は英数字。先頭の `_`/`.` は npm で予約的な意味を持つため不可）
 * に合わせる（src-tauri/src/lib.rs の validate_package_name と同一規則・#88） */
function validatePackageName(value: string): 'required' | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  return /^[a-z0-9][a-z0-9_-]*$/.test(trimmed) ? null : 'invalid'
}

/** バージョンを検証する（semver の major.minor.patch。prerelease/build metadata も許可・#88） */
function validateVersion(value: string): 'required' | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed) ? null : 'invalid'
}

const JSON_SYNTAX_ERROR_MARK = 'JSON 構文エラー'

/**
 * 編集画面のルート。JSON エディタ・確定フィールドのフォーム・本番同一レンダラのライブプレビューを束ね、
 * 保存 / .spkg 書き出しを行う。編集対象は相対パスの生 JSON（source.rawText）で、プレビュー表示のみ
 * baseDir 基準でアセット解決する（保存・書き出しは相対パスのまま＝可搬・無損失）。
 */
export function SlideEditor({
  source,
  onExit,
  openRequestPath = null,
  onResolveOpen,
  onOpenSettings,
  rootDialogOpen,
}: {
  source: EditSource
  onExit: () => void
  /** OS のファイル関連付けから届いたオープン要求のパス（要求なしは null）。未保存の変更があれば確認ダイアログを挟む */
  openRequestPath?: string | null
  /** オープン要求への回答。未保存の変更がなければ確認なしで true、確認ダイアログの確定で true・取消で false を必ず一度返す */
  onResolveOpen?: (confirmed: boolean) => void
  /** 設定ダイアログを開く（所有者は Root。#126） */
  onOpenSettings?: () => void
  /** Root が持つダイアログ（設定・ショートカット一覧）のいずれかが開いているか。所有は Root だが、
   * 開いている間は編集画面の Esc＝編集終了を止める必要があるため hasOpenDialog に加える（#126） */
  rootDialogOpen?: boolean
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(source.rawText)
  const [selectedIndex, setSelectedIndex] = useState(0)
  // パッケージ名・バージョンの初期値は package.json 由来の値を優先し、無ければ meta.title から自動生成する（#88 の続き）。
  // 検証に通らない name（CLI 書き出しは無検証なので実在する）もそのまま入れ、UI の検証エラーで修正を促す
  const [name, setName] = useState(() => source.packageName || slugify(parseSlides(source.rawText).data.meta?.title ?? 'slides', 'slides'))
  const [version, setVersion] = useState(source.packageVersion || DEFAULT_VERSION)
  // 自動生成値のままか（package.json 由来・手動編集後は確認を促すヒントを出さない・#88）
  const [nameIsAuto, setNameIsAuto] = useState(!source.packageName)
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' })
  // AI 生成結果の適用待ち候補（差分確認ダイアログで承認するまで器に触れない・①/FR-008）。
  // validationErrors は exhausted で非空になりうる残存検証エラー（差分確認ダイアログへ渡す・#47）
  const [pendingGenerated, setPendingGenerated] = useState<GeneratedCandidate | null>(null)
  // 層B: パッケージ自身の同梱可能アドオン（baseDir/addons/manifest.json）と、export に含める選択
  const [packageAddons, setPackageAddons] = useState<string[]>([])
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  // 層A: 組み込みアドオン（dev 限定・要再ビルド）。builtinAddons=ソース(addons/src・増減UI用)、
  // builtinDistAddons=ビルド済み(addons/dist・export の同梱候補＝実際に同梱できるものだけ)
  const isDev = import.meta.env.DEV
  const [builtinAddons, setBuiltinAddons] = useState<string[]>([])
  const [builtinDistAddons, setBuiltinDistAddons] = useState<string[]>([])
  const [newBuiltinName, setNewBuiltinName] = useState('')
  // 削除確認待ちの組み込みアドオン名（× は確認ダイアログ経由。誤クリックでの完全削除を防ぐ）
  const [pendingDeleteBuiltin, setPendingDeleteBuiltin] = useState<string | null>(null)
  // 組み込みアドオンのビルド中フラグ（ボタン二重押し防止）
  const [buildingAddons, setBuildingAddons] = useState(false)
  // 編集終了確認待ち（未保存の変更があるときのみ表示。破棄によるデータ損失を防ぐ・#44）
  const [pendingExit, setPendingExit] = useState(false)
  // 外部からのオープン要求の破棄確認待ち（#105）。要求受信時点の dirty 判定をここに確定させ、
  // ダイアログの開閉を props と dirty の積から導出しない（onResolveOpen が必ず一度だけ返る形にする）
  const [confirmingOpen, setConfirmingOpen] = useState(false)
  // ブランド取り込み確認待ち（#168）。抽出＋保存済み上書きの読み込みが終わるまでは null（ダイアログ未表示）
  const [brandImport, setBrandImport] = useState<{ profile: BrandProfile; overrides: BrandOverrides } | null>(null)

  const { data, errors } = useMemo(() => parseSlides(text), [text])
  const hasSyntaxError = errors.some((e) => e.message.includes(JSON_SYNTAX_ERROR_MARK))

  // 直近の妥当データ（構文エラー編集中もプレビューを維持する＝差分描画・全再マウントなし）
  const lastValidRef = useRef<PresentationData>(data)
  if (!hasSyntaxError) lastValidRef.current = data
  const validData = lastValidRef.current

  // meta.brandTheme（組織/ブランドテーマの下地）を解決する。validData（変換前の相対パス）を基準に baseDir から読む
  const brandThemePath = validData.meta?.brandTheme
  const [brandTheme, setBrandTheme] = useState<ThemeData | undefined>(undefined)
  useEffect(() => {
    if (!brandThemePath) {
      setBrandTheme(undefined)
      return
    }
    let cancelled = false
    void resolveBrandTheme(brandThemePath, source.baseDir).then((resolved) => {
      if (!cancelled) setBrandTheme(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [brandThemePath, source.baseDir])

  // meta.themeColors（デッキ固有の12キー色パレット）を取得する。brand と比較し、委譲（#172）の
  // レポート・可否判定に使う。未設定なら何もしない
  const themeColorsPath = validData.meta?.themeColors
  const [themeColorsPalette, setThemeColorsPalette] = useState<ColorPalette | undefined>(undefined)
  useEffect(() => {
    if (!themeColorsPath) {
      setThemeColorsPalette(undefined)
      return
    }
    let cancelled = false
    void fetchColorPalette(themeColorsPath).then(({ palette }) => {
      if (!cancelled) setThemeColorsPalette(palette)
    })
    return () => {
      cancelled = true
    }
  }, [themeColorsPath])

  // プレビュー用にテーマを適用（設計 §9.1 の初期方針: 同一 document。テーマ編集で live 反映）
  const themeKey = JSON.stringify({ theme: validData.theme, themeColors: validData.meta?.themeColors, brandTheme: brandThemePath })
  useEffect(() => {
    void applyPresentationTheme(validData.meta?.themeColors, validData.theme, brandTheme)
    // themeKey・brandTheme が変わったときだけ再適用する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, brandTheme])

  // 層B: パッケージ同梱アドオン一覧を baseDir/addons/manifest.json から読み、既定で全選択にする（従来の全同梱と同挙動）。
  // 層A（組み込み）は既定では未選択＝オプトインで同梱に加える（②）
  useEffect(() => {
    void getPackageAddonNames(source.baseDir).then((names) => {
      setPackageAddons(names)
      setSelectedAddons(names)
    })
  }, [source.baseDir])

  // 同梱候補 = 層B（パッケージ）∪ 層A の**ビルド済み**（dist・実際に同梱可能なものだけ）。name で重複排除（層B 優先の並び）。
  // 未ビルドの src だけの層Aは候補に出さない（選んでも黙って落ちる齟齬を防ぐ・レビュー#4/#6）
  const availableAddons = useMemo(() => Array.from(new Set([...packageAddons, ...builtinDistAddons])), [packageAddons, builtinDistAddons])

  // 層A: dev 環境でのみ組み込みアドオン一覧を読み込む（本番配布では非表示・DC-004）。
  // src（増減 UI 用）と dist（export 同梱候補用）を別々に保持する
  useEffect(() => {
    if (!isDev) return
    void listBuiltinAddons()
      .then(setBuiltinAddons)
      .catch(() => setBuiltinAddons([]))
    void listBuiltinDistAddons()
      .then(setBuiltinDistAddons)
      .catch(() => setBuiltinDistAddons([]))
  }, [isDev])

  const refreshBuiltins = () => {
    void listBuiltinAddons()
      .then(setBuiltinAddons)
      .catch(() => setBuiltinAddons([]))
  }

  const handleAddBuiltin = async () => {
    try {
      await addBuiltinAddon(newBuiltinName)
      setNewBuiltinName('')
      refreshBuiltins()
      setStatus({ kind: 'ok', message: t('edit.builtinAdded', '組み込みアドオンを追加しました（npm run build:addons で再ビルドしてください）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinAddFailed', '追加に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleRemoveBuiltin = async (addon: string) => {
    try {
      await removeBuiltinAddon(addon)
      refreshBuiltins()
      setStatus({ kind: 'ok', message: t('edit.builtinRemoved', '組み込みアドオンを削除しました（要再ビルド）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinRemoveFailed', '削除に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // アプリから組み込みアドオンを再ビルドし、同梱候補（dist）を即更新する（ターミナル不要）
  const handleBuildBuiltins = async () => {
    setBuildingAddons(true)
    setStatus({ kind: 'ok', message: t('edit.builtinBuilding', '組み込みアドオンをビルド中…') })
    try {
      await buildBuiltinAddons()
      refreshBuiltins()
      const dist = await listBuiltinDistAddons().catch(() => [])
      setBuiltinDistAddons(dist)
      setStatus({ kind: 'ok', message: t('edit.builtinBuilt', '組み込みアドオンをビルドしました（同梱候補を更新）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinBuildFailed', 'ビルドに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBuildingAddons(false)
    }
  }

  // プレビュー表示用のアセット解決（パッケージのみ。サンプル/新規は相対のまま app 配下で解決される）
  const previewData = useMemo<PresentationData>(() => (source.baseDir ? resolveLocalAssetPaths(validData, source.baseDir) : validData), [validData, source.baseDir])
  // SlideRenderer は masters/masterMap を直接参照するため、本編と同様に brand→deck の合成済み theme をプレビューに渡す
  const effectiveTheme = useMemo(() => mergeThemeData(brandTheme, previewData.theme), [brandTheme, previewData.theme])
  const { width: previewCanvasWidth, height: previewCanvasHeight } = resolveCanvasSize(effectiveTheme?.canvas)
  const previewAspectRatio = previewCanvasWidth / previewCanvasHeight
  const slides = previewData.slides ?? []
  const clampedIndex = slides.length > 0 ? Math.min(selectedIndex, slides.length - 1) : 0
  const currentSlide: SlideData | undefined = slides[clampedIndex]

  // 保存前バリデーション: 構文・スキーマエラーがあれば書き込みを止める（FR-005）
  const canWrite = errors.length === 0
  // プレビューはデータが妥当なときだけ表示する（JSON/スキーマエラー時は不要）
  const showPreview = errors.length === 0

  // パッケージ名・バージョンの入力検証（不正な値では書き出せないようにする・#88）
  const nameErrorCode = validatePackageName(name)
  const nameErrorMessage =
    nameErrorCode === 'required'
      ? t('edit.packageNameRequired', 'パッケージ名を入力してください')
      : nameErrorCode === 'invalid'
        ? t('edit.packageNameInvalid', 'パッケージ名は小文字英数字・ハイフン・アンダースコアのみ使用でき、先頭は英数字にしてください')
        : null
  const versionErrorCode = validateVersion(version)
  const versionErrorMessage =
    versionErrorCode === 'required' ? t('edit.versionRequired', 'バージョンを入力してください') : versionErrorCode === 'invalid' ? t('edit.versionInvalid', 'バージョンは major.minor.patch 形式（例: 1.0.0）で入力してください') : null
  const canExport = canWrite && nameErrorMessage === null && versionErrorMessage === null
  // 未保存の変更があるか（保存済みの元テキストとの比較。#44: データ損失防止）
  const isDirty = text !== source.rawText
  // 既に開いているダイアログがあるか（Escape ガード用。MUI Dialog 自身の Escape 処理に委ね、二重発火を避ける）
  const hasOpenDialog = pendingExit || pendingGenerated !== null || pendingDeleteBuiltin !== null || confirmingOpen || brandImport !== null || rootDialogOpen

  // 外部（OS のファイル関連付け）からのオープン要求。未保存の変更があれば確認を挟み、なければ即開く。
  // 要求を受けた時点の dirty で判断する（以降の編集で再発火させないため openRequestPath のみを依存にする）
  useEffect(() => {
    if (openRequestPath === null) return
    if (isDirty) setConfirmingOpen(true)
    else onResolveOpen?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestPath])

  const resolveOpen = (confirmed: boolean) => {
    setConfirmingOpen(false)
    onResolveOpen?.(confirmed)
  }

  // 未保存の変更があれば確認ダイアログを挟み、無ければ即終了する
  const handleExitClick = () => {
    if (isDirty) {
      setPendingExit(true)
      return
    }
    onExit()
  }

  const confirmExit = () => {
    setPendingExit(false)
    onExit()
  }

  const cancelExit = () => {
    setPendingExit(false)
  }

  const handleSave = async () => {
    if (!canWrite) {
      setStatus({ kind: 'error', message: t('edit.saveBlocked', '検証エラーがあるため保存できません') })
      return
    }
    try {
      const path = await chooseSlidesSavePath(source.sourcePath)
      if (!path) return
      await saveSlidesJson(path, text)
      setStatus({ kind: 'ok', message: `${t('edit.saved', '保存しました')}: ${path}` })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.saveFailed', '保存に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // keydown リスナーからは常に最新のハンドラ・状態を参照する（ref 経由）。こうすることで
  // effect 自体はマウント時に1回だけ window へ登録すればよく、text 入力等の頻繁な再レンダーで
  // 毎回 addEventListener/removeEventListener が走ることを避けられる
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const handleExitClickRef = useRef(handleExitClick)
  handleExitClickRef.current = handleExitClick
  const hasOpenDialogRef = useRef(hasOpenDialog)
  hasOpenDialogRef.current = hasOpenDialog

  // Cmd/Ctrl+S で保存。修飾キー付きのため通常の文字入力と衝突せず、フォーカス対象を問わず発火させる。
  // Esc で編集終了（未保存時は既存の ConfirmDialog 導線を維持）。T（App.tsx）と同様にフォーカス対象を
  // 確認し、テキスト入力中は無視する（ダイアログ表示中も MUI Dialog 自身の Escape 処理に委ねる）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSaveRef.current()
      } else if (e.key === 'Escape') {
        if (hasOpenDialogRef.current || isTypingTarget(e.target)) return
        handleExitClickRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // AI 生成結果の受け口（#14・FR-004/DC-005）。即時置換せず、まず差分確認ダイアログへ候補を渡す（①）。
  const applyGeneratedSlides = (candidate: GeneratedCandidate) => {
    setPendingGenerated(candidate)
  }

  // 差分確認で [適用する]。候補を 2 スペース整形して単一真実源 text へ全体置換（③）。
  // 以降は既存の useMemo(parseSlides) → プレビュー/フォームへ反映される（無損失・NFR-002）。
  const confirmApplyGenerated = () => {
    if (pendingGenerated === null) return
    setText(prettyPrintJson(pendingGenerated.slidesJson))
    setSelectedIndex(0)
    setPendingGenerated(null)
    setStatus({ kind: 'ok', message: t('aiGenerate.applied', '生成結果を反映しました') })
  }

  // 差分確認で [キャンセル]。候補を破棄し器に一切触れない（安全退避・FR-008）。
  const cancelApplyGenerated = () => {
    setPendingGenerated(null)
  }

  // 「ブランドテーマを取り込む」導線（#168）。テンプレートを選んで抽出し、同一テンプレートの
  // 前回の上書きがあれば読み込んでから確認ダイアログを開く（ここではまだ器に触れない）
  const handleImportBrandTheme = async () => {
    const profile = await pickBrandTemplate()
    if (!profile) return
    const overrides = await loadBrandOverrides(profile.templateHash)
    setBrandImport({ profile, overrides })
  }

  // 「テーマ」見出しの右隣に配置する導線。構文エラー中は SlideMetaForm 自体が非表示になるため、
  // その場合はエラーメッセージの隣に同じ要素をフォールバック表示し、取り込みによる復旧手段を保つ
  const brandImportPrompt = (
    <Tooltip title={t('brand.importHint', '以下の「テーマ」「マスター」に反映されます')}>
      <span>
        <Button variant="outlined" size="small" onClick={() => void handleImportBrandTheme()} disabled={!currentSlide}>
          {t('brand.importButton', 'ブランドテーマを取り込む')}
        </Button>
      </span>
    </Tooltip>
  )

  // 確認ダイアログの [取り込む]。masters/masterMap/tokens/fonts のみ合成し（theme.colors には書き込まない・
  // 12キーは compiled.colors 側で保持するだけ）、上書きはテンプレートハッシュをキーに保存して再取り込みに備える
  const confirmImportBrandTheme = ({ overrides, compiled }: { overrides: BrandOverrides; compiled: CompiledBrandTheme }) => {
    if (!brandImport) return
    setText(serializeSlides({ ...validData, theme: mergeCompiledBrandTheme(validData.theme, compiled) }))
    void saveBrandOverrides(brandImport.profile.templateHash, overrides)
    setBrandImport(null)
    setStatus({ kind: 'ok', message: t('brand.imported', 'ブランドテーマを取り込みました') })
  }

  const cancelImportBrandTheme = () => {
    setBrandImport(null)
  }

  // themeColors 委譲ボタン（#172）。brand と同一色のキーは削除（brand へ委譲）、異なるキーは
  // デッキ固有の意図的な上書きとして theme.colors へ移し、meta.themeColors を撤去する
  const handleDelegateThemeColors = () => {
    if (!themeColorsPalette || !brandTheme?.colors) return
    setText(serializeSlides(delegateThemeColors(validData, themeColorsPalette, brandTheme.colors)))
    setStatus({ kind: 'ok', message: t('brandMigration.delegated', 'themeColors を組織テーマへ委譲しました') })
  }

  const handleExport = async () => {
    if (!canExport) {
      setStatus({ kind: 'error', message: t('edit.exportBlocked', '検証エラーがあるため書き出せません') })
      return
    }
    try {
      const outDir = await chooseExportDir()
      if (!outDir) return
      const pkgPath = await exportSlidePackage(text, { outDir, name, version, baseDir: source.baseDir, includedAddons: selectedAddons })
      setStatus({ kind: 'ok', message: `${t('edit.exported', '書き出しました')}: ${pkgPath}` })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.exportFailed', '書き出しに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <ThemeProvider theme={editorUiTheme}>
      <Box data-testid="slide-editor" sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--fixed-background)', color: 'var(--fixed-text-body)' }}>
        {/* ツールバー。設定ボタンは他画面と同じ「左上」の視覚的位置を保つため最左に置く（#126） */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: '1px solid var(--fixed-border)', flexWrap: 'wrap' }}>
          <SettingsButton onClick={() => onOpenSettings?.()} />
          <Button variant="outlined" size="small" onClick={handleExitClick}>
            {t('edit.exit', '編集を終了')}
          </Button>
          <Box sx={{ flex: 1 }} />
          {/* 注意事項（エラー/自動生成ヒント）は helperText ではなくアイコン+Tooltip で出す。
              helperText はフィールド分だけツールバーの高さを伸ばし、下段の固定高さレイアウト（42%指定）と
              予算が合わず画面全体の崩れを招くため（ツールバーの高さは常に一定に保つ） */}
          <TextField
            label={t('edit.packageName', 'パッケージ名')}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameIsAuto(false)
            }}
            size="small"
            sx={{ width: 180 }}
            error={nameErrorMessage !== null}
            slotProps={{
              input: {
                endAdornment:
                  nameErrorMessage || nameIsAuto ? (
                    <InputAdornment position="end">
                      <Tooltip title={nameErrorMessage ?? t('edit.packageNameHint', 'スライドタイトルから自動生成された値です。書き出し前に確認・修正してください')}>
                        {nameErrorMessage ? (
                          <ErrorOutlineIcon fontSize="small" color="error" titleAccess={nameErrorMessage} />
                        ) : (
                          <InfoOutlinedIcon fontSize="small" sx={{ color: 'var(--fixed-text-muted)' }} titleAccess={t('edit.packageNameHint', 'スライドタイトルから自動生成された値です。書き出し前に確認・修正してください')} />
                        )}
                      </Tooltip>
                    </InputAdornment>
                  ) : undefined,
              },
            }}
          />
          <TextField label={t('edit.version', 'バージョン')} value={version} onChange={(e) => setVersion(e.target.value)} size="small" sx={{ width: 110 }} error={versionErrorMessage !== null} helperText={versionErrorMessage ?? ''} />
          <Button variant="outlined" size="small" onClick={handleSave} disabled={!canWrite}>
            {t('edit.save', '保存')}
          </Button>
          <Button variant="contained" size="small" onClick={handleExport} disabled={!canExport}>
            {t('edit.export', '.spkg 書き出し')}
          </Button>
        </Stack>

        {status.kind !== 'idle' && (
          <Box role="status" sx={{ px: 2, py: 0.5, fontSize: 13, wordBreak: 'break-all', color: status.kind === 'error' ? 'var(--fixed-primary)' : 'var(--fixed-success)', backgroundColor: 'var(--fixed-background-alt)' }}>
            {status.message}
          </Box>
        )}

        {/* 生成結果の適用前 差分確認ダイアログ（①・案3）。承認で整形して全体置換、キャンセルで破棄 */}
        <GeneratedDiffDialog
          open={pendingGenerated !== null}
          beforeText={text}
          afterText={pendingGenerated?.slidesJson ?? ''}
          validationErrors={pendingGenerated?.validationErrors ?? []}
          onApply={confirmApplyGenerated}
          onCancel={cancelApplyGenerated}
        />

        {/* ブランド抽出（#167）の並置比較・取り込み確認ダイアログ（#168）。currentSlide が無ければボタン自体を無効化しているため必ず存在する */}
        {brandImport && currentSlide && (
          <BrandConfirmDialog
            open
            profile={brandImport.profile}
            initialOverrides={brandImport.overrides}
            previewSlide={currentSlide}
            previewLogo={previewData.meta?.logo}
            previewTheme={effectiveTheme}
            onApply={confirmImportBrandTheme}
            onCancel={cancelImportBrandTheme}
          />
        )}

        {/* 未保存の変更を破棄して編集を終了する前の確認（#44: データ損失防止） */}
        <ConfirmDialog
          open={pendingExit}
          title={t('edit.exitConfirmTitle', '未保存の変更を破棄しますか？')}
          message={t('edit.exitConfirmMessage', '編集内容は保存されていません。破棄して編集を終了しますか？')}
          confirmLabel={t('edit.exitConfirmDiscard', '破棄して終了')}
          cancelLabel={t('edit.cancel', 'キャンセル')}
          onConfirm={confirmExit}
          onCancel={cancelExit}
        />

        {/* 外部（OS のファイル関連付け）から開く要求が来たとき、未保存の変更を破棄する前の確認（#105） */}
        <ConfirmDialog
          open={confirmingOpen}
          title={t('edit.openConfirmTitle', '未保存の変更を破棄して開きますか？')}
          message={t('edit.openConfirmMessage', '編集内容は保存されていません。破棄して選択されたスライドを開きますか？')}
          confirmLabel={t('edit.openConfirmDiscard', '破棄して開く')}
          cancelLabel={t('edit.cancel', 'キャンセル')}
          onConfirm={() => resolveOpen(true)}
          onCancel={() => resolveOpen(false)}
        />

        {/* 組み込みアドオン削除の確認（× は確認経由。addons/src を完全削除し git 管理外＝復元不可のため誤クリック防止） */}
        <ConfirmDialog
          open={pendingDeleteBuiltin !== null}
          title={t('edit.builtinRemoveConfirmTitle', '組み込みアドオンを削除しますか？')}
          message={t('edit.builtinRemoveConfirmMessage', '{name} のソース（addons/src）を完全に削除します。取り消せません（git 管理外のため復元できません）。').replace('{name}', pendingDeleteBuiltin ?? '')}
          confirmLabel={t('edit.builtinRemoveConfirm', '削除する')}
          cancelLabel={t('edit.cancel', 'キャンセル')}
          onConfirm={() => {
            const target = pendingDeleteBuiltin
            setPendingDeleteBuiltin(null)
            if (target !== null) void handleRemoveBuiltin(target)
          }}
          onCancel={() => setPendingDeleteBuiltin(null)}
        />

        {/* 同梱アドオンの個別選択（層B∪層A）。候補が無くても非表示にせず状態を明示する（②）。
            ×ボタンを層A（builtinAddons）と同じ見た目で用意し削除導線を統一する（#36）。
            チェック解除と同じ効果の可逆操作（再チェックで復帰可）のため確認ダイアログは設けない。 */}
        <Stack direction="row" spacing={1} alignItems="center" role="group" aria-labelledby="include-addons-label" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--fixed-border)', flexWrap: 'wrap' }}>
          <Typography id="include-addons-label" variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
            {t('edit.includeAddons', '同梱アドオン')}:
          </Typography>
          {availableAddons.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('edit.noAddons', '同梱できるアドオンがありません')}
            </Typography>
          ) : (
            <>
              {availableAddons.map((addon) => {
                const included = selectedAddons.includes(addon)
                const exclude = () => setSelectedAddons((prev) => prev.filter((a) => a !== addon))
                return (
                  <Stack key={addon} direction="row" spacing={0.5} alignItems="center" sx={{ border: '1px solid var(--fixed-border)', borderRadius: 1, pl: 1, opacity: included ? 1 : 0.6 }}>
                    <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={included} onChange={(e) => (e.target.checked ? setSelectedAddons((prev) => [...prev, addon]) : exclude())} />} label={addon} />
                    <Button size="small" color="inherit" onClick={exclude} disabled={!included} aria-label={t('edit.packageAddonRemoveAria', '{name} をパッケージから除外').replace('{name}', addon)}>
                      ×
                    </Button>
                  </Stack>
                )
              })}
              <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
                {t('edit.packageAddonRemoveNote', '×またはチェック解除でパッケージから除外されます（再チェックで復帰可）。反映には「.spkg 書き出し」が必要です')}
              </Typography>
            </>
          )}
        </Stack>

        {/* 層A: 組み込みアドオンの増減（dev 限定・要再ビルド・DC-004。本番配布では非表示） */}
        {isDev && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--fixed-border)', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('edit.builtinAddons', '組み込みアドオン (dev)')}:
            </Typography>
            {builtinAddons.map((addon) => (
              <Stack key={addon} direction="row" spacing={0.5} alignItems="center" sx={{ border: '1px solid var(--fixed-border)', borderRadius: 1, pl: 1 }}>
                <Typography variant="body2">{addon}</Typography>
                <Button size="small" color="inherit" onClick={() => setPendingDeleteBuiltin(addon)} aria-label={t('edit.builtinRemoveAria', '{name} を削除').replace('{name}', addon)}>
                  ×
                </Button>
              </Stack>
            ))}
            <TextField size="small" placeholder={t('edit.builtinNamePlaceholder', '新規アドオン名')} value={newBuiltinName} onChange={(e) => setNewBuiltinName(e.target.value)} sx={{ width: 160 }} />
            <Button size="small" variant="outlined" onClick={() => void handleAddBuiltin()} disabled={!newBuiltinName.trim()}>
              {t('edit.builtinAdd', '追加')}
            </Button>
            <Button size="small" variant="contained" onClick={() => void handleBuildBuiltins()} disabled={buildingAddons}>
              {buildingAddons ? t('edit.builtinBuildingShort', 'ビルド中…') : t('edit.builtinBuild', 'ビルド')}
            </Button>
            <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
              {t('edit.builtinRebuildNote', '追加/削除後は「ビルド」で同梱候補に反映されます')}
            </Typography>
          </Stack>
        )}

        {/* 本体: 上段=フォーム(70%)＋プレビュー(30%) / 下段=slides.json（全幅）。
            プレゼン資料は横長のためプレビューは上段の 30% 側に置き、JSON 編集は下段で全幅を使う。
            JSON/スキーマエラー時はプレビューを非表示にし、フォームを全幅にする（プレビューは不要なため）。 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, p: 1 }}>
          {/* 上段: 7:3（フォーム : プレビュー）。プレビュー表示時のみ高さを固定して余白（デッドスペース）を抑える */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: showPreview ? 'minmax(0, 7fr) minmax(0, 3fr)' : '1fr' },
              gap: 1,
              flexShrink: 0,
              minHeight: 0,
              ...(showPreview ? { height: '42%' } : {}),
            }}
          >
            {/* フォーム（確定フィールド）。上段が固定高さのとき、はみ出せばこの中でスクロールする。
                AI 生成パネル（#14）はフォームの上（＝プレビューの左）に配置する（#33）。
                生成結果は applyGeneratedSlides で差分確認ダイアログへ渡す（①） */}
            <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
              {themeColorsPalette && <ThemeColorsMigrationNotice themeColorsPalette={themeColorsPalette} brandColors={brandTheme?.colors} onDelegate={handleDelegateThemeColors} />}
              <AiGeneratePanel currentText={text} onApply={applyGeneratedSlides} defaultExpanded={source.aiPanelExpanded} />
              {hasSyntaxError ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, m: 1 }}>
                  <Typography variant="body2" sx={{ color: 'var(--fixed-primary)' }}>
                    {t('edit.formDisabled', 'JSON に構文エラーがあるためフォーム編集は無効です')}
                  </Typography>
                  {brandImportPrompt}
                </Box>
              ) : (
                <SlideMetaForm value={validData} onChange={(next) => setText(serializeSlides(next))} themeSectionSlot={brandImportPrompt} currentSlideIndex={clampedIndex} />
              )}
            </Box>

            {/* プレビュー（従）。JSON/スキーマエラー時は非表示にしフォームを全幅にする */}
            {showPreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                  <Button size="small" onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))} disabled={clampedIndex <= 0}>
                    ‹
                  </Button>
                  <Typography variant="body2">{slides.length > 0 ? `${clampedIndex + 1} / ${slides.length}` : '0 / 0'}</Typography>
                  <Button size="small" onClick={() => setSelectedIndex((i) => Math.min(slides.length - 1, i + 1))} disabled={clampedIndex >= slides.length - 1}>
                    ›
                  </Button>
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: previewAspectRatio,
                      maxHeight: '100%',
                      position: 'relative',
                      border: '1px solid var(--fixed-border)',
                      borderRadius: 1,
                      overflow: 'hidden',
                      backgroundColor: 'var(--fixed-background-alt)',
                    }}
                  >
                    {currentSlide ? (
                      // プレビューだけはプレゼン用テーマ（スライド本来のフォントサイズ）で描画する。編集 chrome は editorUiTheme のまま
                      <ThemeProvider theme={theme}>
                        <SlidePreview slide={currentSlide} logo={previewData.meta?.logo} theme={effectiveTheme} index={clampedIndex} total={slides.length} />
                      </ThemeProvider>
                    ) : (
                      <Box sx={{ p: 2, color: 'var(--fixed-text-muted)' }}>{t('edit.noSlides', 'スライドがありません')}</Box>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          {/* 下段: slides.json（全幅・残り高さいっぱい・内部スクロール） */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <SlideJsonEditor value={text} onChange={setText} errors={errors} />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
