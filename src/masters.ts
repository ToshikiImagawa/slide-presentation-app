import { hasComponent } from './components/ComponentRegistry'
import type { MasterDecoration, MasterDefinition, MasterRenderContext, SlideData, ThemeData } from './data'

const MASTER_DECORATION_TYPES = ['logo', 'band', 'rule', 'text', 'image', 'component'] as const
const MASTER_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
const MASTER_DECORATION_ONLY = ['first', 'last', 'not-first', 'all', 'middle', 'section-first', 'not-section-first'] as const
const MASTER_DECORATION_LAYER = ['back', 'front'] as const

export interface ResolvedMaster {
  masterKey: string
  decorations: MasterDecoration[]
}

/**
 * masterKey を解決順序どおりに候補列挙し、extends チェーンを辿って decorations を合成する
 * （親→子の順にマージ）。解決順序: ①opts.master（スライド個別指定）→ ②masterMap["<layout>/<variant>"]
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
    return { masterKey, decorations: collectDecorations(masters, masterKey) }
  }

  return undefined
}

function collectDecorations(masters: Record<string, MasterDefinition>, key: string): MasterDecoration[] {
  const definition = masters[key]
  if (!definition) return []
  const inherited = definition.extends ? collectDecorations(masters, definition.extends) : []
  return [...inherited, ...(definition.decorations ?? [])]
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

/** text 装飾の content で使えるテンプレート変数（#191） */
const MASTER_TEXT_VARIABLES = ['index', 'total', 'sectionNumber', 'sectionTitle', 'sectionIndex', 'sectionTotal'] as const
type MasterTextVariable = (typeof MASTER_TEXT_VARIABLES)[number]

/** `{name}`（そのまま）または `{name:0N}`（N桁ゼロ詰め）にマッチする */
const MASTER_TEXT_PATTERN = /\{(\w+)(?::0(\d+))?\}/g

function isMasterTextVariable(name: string): name is MasterTextVariable {
  return (MASTER_TEXT_VARIABLES as readonly string[]).includes(name)
}

function masterTextValue(name: MasterTextVariable, ctx: MasterRenderContext): string | number | undefined {
  switch (name) {
    case 'index':
      return ctx.index + 1
    case 'total':
      return ctx.total
    case 'sectionNumber':
      return ctx.section?.number
    case 'sectionTitle':
      return ctx.section?.title
    case 'sectionIndex':
      return ctx.section ? ctx.index - ctx.section.startIndex + 1 : undefined
    case 'sectionTotal':
      return ctx.section?.slideCount
  }
}

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
    if (!isMasterTextVariable(name)) return match
    const value = masterTextValue(name, ctx)
    if (value === undefined) return ''
    return pad ? String(value).padStart(Number(pad), '0') : String(value)
  })
}

/** content 内のテンプレート変数のうち、renderMasterText が展開できない名前を重複なしで返す */
function unknownTextVariables(content: string): string[] {
  const names = [...content.matchAll(MASTER_TEXT_PATTERN)].map(([, name]) => name).filter((name) => !isMasterTextVariable(name))
  return [...new Set(names)]
}

/**
 * masters/masterMap/tokens、および slides[].meta.master（スライド個別指定）の値検証エラー
 * （綴りミス等）を警告として返す。getThemeWarnings と同じ方針: 検証エラーではなく警告として扱い、
 * 描画は継続する（resolveMaster は循環・未解決を静かに次の候補へフォールバックするため、
 * その事実をここで利用者に伝える）。slides は省略可能（省略時は meta.master の検証をスキップする）。
 */
export function getMasterWarnings(theme?: ThemeData, slides?: SlideData[]): string[] {
  const warnings: string[] = []
  if (!theme) return warnings

  const masters = theme.masters ?? {}
  const masterKeys = new Set(Object.keys(masters))

  for (const [layout, masterKey] of Object.entries(theme.masterMap ?? {})) {
    if (!masterKeys.has(masterKey)) {
      warnings.push(`theme.masterMap.${layout}: 存在しない masterKey "${masterKey}" を参照しています`)
    }
  }

  for (const [index, slide] of (slides ?? []).entries()) {
    const masterKey = slide.meta?.master
    if (masterKey && !masterKeys.has(masterKey)) {
      warnings.push(`slides[${index}].meta.master: 存在しない masterKey "${masterKey}" を参照しています`)
    }
  }

  for (const [masterKey, definition] of Object.entries(masters)) {
    if (definition.extends && !masterKeys.has(definition.extends)) {
      warnings.push(`theme.masters.${masterKey}.extends: 存在しない masterKey "${definition.extends}" を参照しています`)
    }
    if (definition.extends && isCircular(masters, masterKey)) {
      warnings.push(`theme.masters.${masterKey}: extends が循環しています`)
    }

    for (const [i, decoration] of (definition.decorations ?? []).entries()) {
      const path = `theme.masters.${masterKey}.decorations[${i}]`
      if (!MASTER_DECORATION_TYPES.includes(decoration.type)) {
        warnings.push(`${path}.type: 不明な種別 "${decoration.type}" です（logo/band/rule/text/image/component のいずれかを指定してください）`)
        continue
      }
      if (!MASTER_ANCHORS.includes(decoration.anchor)) {
        warnings.push(`${path}.anchor: 不明な値 "${decoration.anchor}" です`)
      }
      if (decoration.only && !MASTER_DECORATION_ONLY.includes(decoration.only)) {
        warnings.push(`${path}.only: 不明な値 "${decoration.only}" です`)
      }
      if (decoration.layer && !MASTER_DECORATION_LAYER.includes(decoration.layer)) {
        warnings.push(`${path}.layer: 不明な値 "${decoration.layer}" です`)
      }
      if (decoration.type === 'text') {
        for (const name of unknownTextVariables(decoration.content)) {
          warnings.push(`${path}.content: 不明なテンプレート変数 "{${name}}" です（${MASTER_TEXT_VARIABLES.join('/')} のいずれかを指定してください）`)
        }
      }
      if (decoration.type === 'component' && !hasComponent(decoration.name)) {
        warnings.push(`${path}.name: 未登録のコンポーネント "${decoration.name}" が指定されています（該当箇所は描画をスキップします）`)
      }
    }
  }

  for (const masterKey of Object.keys(theme.tokens ?? {})) {
    if (masterKey !== GLOBAL_TOKEN_SCOPE && !masterKeys.has(masterKey)) {
      warnings.push(`theme.tokens.${masterKey}: 存在しない masterKey です`)
    }
  }

  return warnings
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
