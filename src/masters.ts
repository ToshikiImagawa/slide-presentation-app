import { hasComponent } from './components/ComponentRegistry'
import type { MasterBackground, MasterDecoration, MasterDecorationOnly, MasterDefinition, MasterGradient, MasterRenderContext, SlideData, ThemeData } from './data'

// schema/slide-content-schema.json の theme.masters 配下の同名 enum と手作業で同期している。
// slideContentSchema.ts の SCHEMA は AI生成専用の厳格検証のためのモジュールであり、汎用の
// getMasterWarnings（手動編集・アドオン拡張を阻害しないための検証）をそこへ結合させない設計上、
// ここでは自前の定数として持つ。値がずれると生成AIが受け取る仕様と実行時検証が食い違うため、
// 両者の同値性は slideContentSchema.test.ts でドリフト検知する（#238）
export const MASTER_DECORATION_TYPES = ['logo', 'band', 'rule', 'text', 'image', 'component'] as const
export const MASTER_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
export const MASTER_DECORATION_ONLY = ['first', 'last', 'not-first', 'all', 'middle', 'section-first', 'not-section-first'] as const
export const MASTER_DECORATION_LAYER = ['back', 'front'] as const
export const MASTER_BACKGROUND_TYPES = ['plain', 'grid', 'fill', 'gradient', 'image'] as const
export const MASTER_BACKGROUND_FITS = ['cover', 'contain'] as const

/** extends が解けた状態のマスター定義（decorations は常に配列に正規化する）。継承できるフィールドは
 * MasterDefinition 側の語彙で決まるため、フィールドを増やしてもこの型は追随不要 */
type MergedMasterDefinition = Omit<MasterDefinition, 'extends' | 'decorations'> & { decorations: MasterDecoration[] }

/** 合成済みのマスター定義に、採用された masterKey を添えた描画側の契約 */
export type ResolvedMaster = MergedMasterDefinition & { masterKey: string }

/**
 * masterKey を解決順序どおりに候補列挙し、extends チェーンを辿って定義を合成する。
 * 解決順序: ①opts.master（スライド個別指定）→ ②masterMap["<layout>/<variant>"]
 * （opts.variant があるときのみ）→ ③masterMap["<layout>"] → ④解決なし。
 * 各候補は masters に存在し extends が循環していない場合のみ採用し、そうでなければ次の候補へ
 * フォールバックする（未解決の masterKey 指定は getMasterWarnings が警告する）。
 * 候補が尽きた場合は undefined を返す（呼び出し元は「現行と完全同一のDOM」にフォールバックする）。
 */
export function resolveMaster(theme: ThemeData | undefined, layout: string, opts?: { master?: string; variant?: string }): ResolvedMaster | undefined {
  const masters = theme?.masters
  const masterMap = theme?.masterMap

  const candidates = [opts?.master, opts?.variant ? masterMap?.[`${layout}/${opts.variant}`] : undefined, masterMap?.[layout]]

  for (const masterKey of candidates) {
    if (!masterKey || !masters?.[masterKey] || isCircular(masters, masterKey)) continue
    return { masterKey, ...collectDefinition(masters, masterKey) }
  }

  return undefined
}

/**
 * extends チェーンを1度だけ辿って定義を合成する（循環していないことは呼び出し側が確認済み）。
 * フィールドごとのマージ規則: decorations は親→子の順に連結し、background は重ね合わせできないため
 * 自身に近い定義が勝つ（#189）。継承対象のフィールドを増やすときはここに規則を1行足す。
 */
function collectDefinition(masters: Record<string, MasterDefinition>, key: string): MergedMasterDefinition {
  const definition = masters[key]
  if (!definition) return { decorations: [] }
  const inherited = definition.extends ? collectDefinition(masters, definition.extends) : { decorations: [] }
  return {
    decorations: [...inherited.decorations, ...(definition.decorations ?? [])],
    background: definition.background ?? inherited.background,
  }
}

/**
 * theme.tokens の全体スコープを表す予約キー（#190）。masterKey ではなく :root へ出力するため、
 * 意匠トークン（角丸・線幅等）をマスターに紐付けずデッキ全体へ一括指定できる。
 * master スコープ（詳細度 0,1,1）の方が :root（0,1,0）より強いため、両方指定した場合は master 側が勝つ
 */
const GLOBAL_TOKEN_SCOPE = '*'

/** CSS 変数トークンから、masterKey は section[data-master="key"] スコープ・"*" は :root スコープの CSS を生成する */
export function buildMasterCss(tokens: Record<string, Record<string, string>> | undefined): string {
  if (!tokens) return ''
  return Object.entries(tokens)
    .filter(([, vars]) => Object.keys(vars).length > 0)
    .map(([scope, vars]) => {
      const decls = Object.entries(vars)
        .map(([name, value]) => `--${name}: ${value};`)
        .join(' ')
      const selector = scope === GLOBAL_TOKEN_SCOPE ? ':root' : `section[data-master="${scope}"]`
      return `${selector} { ${decls} }`
    })
    .join('\n')
}

/** 装飾の適用条件（only）を描画時の位置・章情報から判定する。未知の値は all と同じ扱いで全スライドに出す
 * （綴りミスは getMasterWarnings が警告する）。#191 で middle / section-first / not-section-first を追加 */
export function matchesDecorationOnly(only: MasterDecorationOnly | undefined, ctx: MasterRenderContext): boolean {
  switch (only) {
    case 'first':
      return ctx.index === 0
    case 'last':
      return ctx.index === ctx.total - 1
    case 'not-first':
      return ctx.index !== 0
    case 'middle':
      return ctx.index !== 0 && ctx.index !== ctx.total - 1
    case 'section-first':
      return isSectionFirst(ctx)
    case 'not-section-first':
      return !isSectionFirst(ctx)
    default:
      return true
  }
}

/** 章の先頭スライド（章扉）かどうか。章に属さないスライドは章の先頭ではない（#191） */
function isSectionFirst(ctx: MasterRenderContext): boolean {
  return ctx.section !== undefined && ctx.section.startIndex === ctx.index
}

/** text 装飾の content で使えるテンプレート変数（#191）。キーがそのまま既知の変数名の一覧になる */
const MASTER_TEXT_RESOLVERS = new Map<string, (ctx: MasterRenderContext) => string | number | undefined>([
  ['index', (ctx) => ctx.index + 1],
  ['total', (ctx) => ctx.total],
  ['sectionNumber', (ctx) => ctx.section?.number],
  ['sectionTitle', (ctx) => ctx.section?.title],
  ['sectionIndex', (ctx) => (ctx.section ? ctx.index - ctx.section.startIndex + 1 : undefined)],
  ['sectionTotal', (ctx) => ctx.section?.slideCount],
])

/** `{name}`（そのまま）または `{name:0N}`（N桁ゼロ詰め）にマッチする */
const MASTER_TEXT_PATTERN = /\{(\w+)(?::0(\d+))?\}/g

/**
 * text 装飾の content 内のテンプレート変数を展開する。`{index}`/`{total}`（ページ番号）に加え、
 * `{sectionNumber}`/`{sectionTitle}`/`{sectionIndex}`/`{sectionTotal}`（章情報）を展開し、
 * `{sectionNumber:02}` のように `:0N` を付けるとN桁ゼロ詰めになる（「第 03 章」等の表記・#191）。
 *
 * 章に属さないスライド（meta.section 未指定）では章の変数が空文字になる。未知の変数名は本文中の
 * 波括弧を壊さないためそのまま残し、綴りミスは getMasterWarnings が警告として拾う。
 */
export function renderMasterText(content: string, ctx: MasterRenderContext): string {
  return content.replace(MASTER_TEXT_PATTERN, (match, name: string, pad: string | undefined) => {
    const resolve = MASTER_TEXT_RESOLVERS.get(name)
    if (!resolve) return match
    const value = resolve(ctx)
    if (value === undefined) return ''
    return pad ? String(value).padStart(Number(pad), '0') : String(value)
  })
}

/** opacity は未指定（=1 相当）か 0〜1 の数値のみ許容する（JSON 由来のため文字列・NaN・Infinity も来る・#189） */
function opacityWarnings(opacity: number | undefined, path: string): string[] {
  if (opacity === undefined || (typeof opacity === 'number' && opacity >= 0 && opacity <= 1)) return []
  return [`${path}.opacity: 0〜1 の数値を指定してください（"${opacity}"）`]
}

/** MasterGradient は背景（type: gradient）と帯装飾（band.gradient）で共有するため、検証も共有する（#189）。
 * 片方が欠けると linear-gradient 自体が不正になり CSS 側で宣言ごと破棄される（無言で消える）ため警告する */
function gradientWarnings(gradient: MasterGradient, path: string): string[] {
  if (!gradient.from || !gradient.to) return [`${path}: gradient には from / to の両方が必要です`]
  return []
}

/**
 * 背景定義（#189）の値検証。種別が不明な場合は SlideMasterBackground が何も描けないため以降の検証は行わない。
 * 必須プロパティ（fill の color 等）は型では強制できても JSON では欠けうるため、ここで警告する。
 */
function backgroundWarnings(background: MasterBackground, path: string): string[] {
  if (!MASTER_BACKGROUND_TYPES.includes(background.type)) {
    return [`${path}.type: 不明な種別 "${background.type}" です（${MASTER_BACKGROUND_TYPES.join('/')} のいずれかを指定してください）`]
  }

  const warnings = [...opacityWarnings(background.opacity, path)]

  switch (background.type) {
    case 'grid':
      if (background.size !== undefined && !(typeof background.size === 'number' && background.size > 0)) {
        warnings.push(`${path}.size: 0 より大きい数値（px）を指定してください（"${background.size}"）`)
      }
      break
    case 'fill':
      if (!background.color) {
        warnings.push(`${path}.color: fill には塗り色が必要です（省略する場合は type: "plain" を使ってください）`)
      }
      break
    case 'gradient':
      warnings.push(...gradientWarnings(background, path))
      break
    case 'image':
      if (!background.src) {
        warnings.push(`${path}.src: image には画像パスが必要です`)
      }
      if (background.fit && !MASTER_BACKGROUND_FITS.includes(background.fit)) {
        warnings.push(`${path}.fit: 不明な値 "${background.fit}" です（${MASTER_BACKGROUND_FITS.join('/')} のいずれかを指定してください）`)
      }
      break
  }

  return warnings
}

/**
 * 装飾1件の値検証。種別が不明な場合は何も描けないため以降の検証は行わない（backgroundWarnings と同じ方針）。
 * 共通プロパティ（anchor/only/layer/opacity/rotate）を見たあと、種別固有の規則を switch で並べる。
 */
function decorationWarnings(decoration: MasterDecoration, path: string): string[] {
  if (!MASTER_DECORATION_TYPES.includes(decoration.type)) {
    return [`${path}.type: 不明な種別 "${decoration.type}" です（${MASTER_DECORATION_TYPES.join('/')} のいずれかを指定してください）`]
  }

  const warnings = [...opacityWarnings(decoration.opacity, path)]
  if (!MASTER_ANCHORS.includes(decoration.anchor)) {
    warnings.push(`${path}.anchor: 不明な値 "${decoration.anchor}" です`)
  }
  if (decoration.only && !MASTER_DECORATION_ONLY.includes(decoration.only)) {
    warnings.push(`${path}.only: 不明な値 "${decoration.only}" です`)
  }
  if (decoration.layer && !MASTER_DECORATION_LAYER.includes(decoration.layer)) {
    warnings.push(`${path}.layer: 不明な値 "${decoration.layer}" です`)
  }
  if (decoration.rotate !== undefined && !Number.isFinite(decoration.rotate)) {
    warnings.push(`${path}.rotate: 数値（deg）を指定してください（"${decoration.rotate}"）`)
  }

  switch (decoration.type) {
    case 'band':
      if (decoration.gradient) {
        warnings.push(...gradientWarnings(decoration.gradient, `${path}.gradient`))
      }
      break
    case 'text':
      for (const name of unknownTextVariables(decoration.content)) {
        warnings.push(`${path}.content: 不明なテンプレート変数 "{${name}}" です（${[...MASTER_TEXT_RESOLVERS.keys()].join('/')} のいずれかを指定してください）`)
      }
      break
    case 'component':
      if (!hasComponent(decoration.name)) {
        warnings.push(`${path}.name: 未登録のコンポーネント "${decoration.name}" が指定されています（該当箇所は描画をスキップします）`)
      }
      break
  }

  return warnings
}

/** content 内のテンプレート変数のうち、renderMasterText が展開できない名前を重複なしで返す */
function unknownTextVariables(content: string): string[] {
  const names = [...content.matchAll(MASTER_TEXT_PATTERN)].map(([, name]) => name).filter((name) => !MASTER_TEXT_RESOLVERS.has(name))
  return [...new Set(names)]
}

/** theme.masterMap の各エントリが masters に存在する masterKey を参照しているかを検証する */
function masterMapWarnings(masterMap: Record<string, string> | undefined, masterKeys: Set<string>): string[] {
  return Object.entries(masterMap ?? {})
    .filter(([, masterKey]) => !masterKeys.has(masterKey))
    .map(([layout, masterKey]) => `theme.masterMap.${layout}: 存在しない masterKey "${masterKey}" を参照しています`)
}

/** slides[].meta.master（スライド個別指定）が masters に存在する masterKey を参照しているかを検証する */
function slideMasterWarnings(slides: SlideData[] | undefined, masterKeys: Set<string>): string[] {
  const warnings: string[] = []
  for (const [index, slide] of (slides ?? []).entries()) {
    const masterKey = slide.meta?.master
    if (masterKey && !masterKeys.has(masterKey)) {
      warnings.push(`slides[${index}].meta.master: 存在しない masterKey "${masterKey}" を参照しています`)
    }
  }
  return warnings
}

/** theme.masters の各定義（extends の存在・循環、background、decorations）を検証する */
function definitionWarnings(masters: Record<string, MasterDefinition>, masterKeys: Set<string>): string[] {
  const warnings: string[] = []
  for (const [masterKey, definition] of Object.entries(masters)) {
    if (definition.extends && !masterKeys.has(definition.extends)) {
      warnings.push(`theme.masters.${masterKey}.extends: 存在しない masterKey "${definition.extends}" を参照しています`)
    }
    if (definition.extends && isCircular(masters, masterKey)) {
      warnings.push(`theme.masters.${masterKey}: extends が循環しています`)
    }
    if (definition.background) {
      warnings.push(...backgroundWarnings(definition.background, `theme.masters.${masterKey}.background`))
    }

    for (const [i, decoration] of (definition.decorations ?? []).entries()) {
      warnings.push(...decorationWarnings(decoration, `theme.masters.${masterKey}.decorations[${i}]`))
    }
  }
  return warnings
}

/** theme.tokens のスコープキー（GLOBAL_TOKEN_SCOPE を除く）が masters に存在する masterKey かを検証する */
function tokenWarnings(tokens: Record<string, Record<string, string>> | undefined, masterKeys: Set<string>): string[] {
  return Object.keys(tokens ?? {})
    .filter((masterKey) => masterKey !== GLOBAL_TOKEN_SCOPE && !masterKeys.has(masterKey))
    .map((masterKey) => `theme.tokens.${masterKey}: 存在しない masterKey です`)
}

/**
 * masters/masterMap/tokens、および slides[].meta.master（スライド個別指定）の値検証エラー
 * （綴りミス等）を警告として返す。getThemeWarnings と同じ方針: 検証エラーではなく警告として扱い、
 * 描画は継続する（resolveMaster は循環・未解決を静かに次の候補へフォールバックするため、
 * その事実をここで利用者に伝える）。slides は省略可能（省略時は meta.master の検証をスキップする）。
 */
export function getMasterWarnings(theme?: ThemeData, slides?: SlideData[]): string[] {
  if (!theme) return []

  const masters = theme.masters ?? {}
  const masterKeys = new Set(Object.keys(masters))

  return [masterMapWarnings(theme.masterMap, masterKeys), slideMasterWarnings(slides, masterKeys), definitionWarnings(masters, masterKeys), tokenWarnings(theme.tokens, masterKeys)].flat()
}

function isCircular(masters: Record<string, MasterDefinition>, startKey: string): boolean {
  const visited = new Set<string>()
  let key: string | undefined = startKey
  while (key) {
    if (visited.has(key)) return true
    visited.add(key)
    key = masters[key]?.extends
  }
  return false
}
