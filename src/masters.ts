import { hasComponent } from './components/ComponentRegistry'
import type { MasterDecoration, MasterDefinition, ThemeData } from './data'

const MASTER_DECORATION_TYPES = ['logo', 'band', 'rule', 'text', 'image', 'component'] as const
const MASTER_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
const MASTER_DECORATION_ONLY = ['first', 'last', 'not-first', 'all'] as const
const MASTER_DECORATION_LAYER = ['back', 'front'] as const

export interface ResolvedMaster {
  masterKey: string
  decorations: MasterDecoration[]
}

/**
 * layout（SlideData.layout の値）から masterMap 経由で masterKey を求め、
 * extends チェーンを辿って decorations を合成する（親→子の順にマージ）。
 * masterMap 未指定・masterKey 未解決・extends 循環のいずれの場合も undefined を返す
 * （呼び出し元は「現行と完全同一のDOM」にフォールバックする）。
 */
export function resolveMaster(theme: ThemeData | undefined, layout: string): ResolvedMaster | undefined {
  const masterKey = theme?.masterMap?.[layout]
  if (!masterKey) return undefined

  const masters = theme?.masters
  if (!masters?.[masterKey] || isCircular(masters, masterKey)) return undefined

  return { masterKey, decorations: collectDecorations(masters, masterKey) }
}

function collectDecorations(masters: Record<string, MasterDefinition>, key: string): MasterDecoration[] {
  const definition = masters[key]
  if (!definition) return []
  const inherited = definition.extends ? collectDecorations(masters, definition.extends) : []
  return [...inherited, ...(definition.decorations ?? [])]
}

/** masterKey ごとの CSS 変数トークンから section[data-master="key"] スコープの CSS を生成する */
export function buildMasterCss(tokens: Record<string, Record<string, string>> | undefined): string {
  if (!tokens) return ''
  return Object.entries(tokens)
    .filter(([, vars]) => Object.keys(vars).length > 0)
    .map(([masterKey, vars]) => {
      const decls = Object.entries(vars)
        .map(([name, value]) => `--${name}: ${value};`)
        .join(' ')
      return `section[data-master="${masterKey}"] { ${decls} }`
    })
    .join('\n')
}

/**
 * masters/masterMap/tokens の値検証エラー（綴りミス等）を警告として返す。
 * getThemeWarnings と同じ方針: 検証エラーではなく警告として扱い、描画は継続する
 * （resolveMaster は循環・未解決を静かにフォールバックするため、その事実をここで利用者に伝える）。
 */
export function getMasterWarnings(theme?: ThemeData): string[] {
  const warnings: string[] = []
  if (!theme) return warnings

  const masters = theme.masters ?? {}
  const masterKeys = new Set(Object.keys(masters))

  for (const [layout, masterKey] of Object.entries(theme.masterMap ?? {})) {
    if (!masterKeys.has(masterKey)) {
      warnings.push(`theme.masterMap.${layout}: 存在しない masterKey "${masterKey}" を参照しています`)
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
      if (decoration.type === 'component' && !hasComponent(decoration.name)) {
        warnings.push(`${path}.name: 未登録のコンポーネント "${decoration.name}" が指定されています（該当箇所は描画をスキップします）`)
      }
    }
  }

  for (const masterKey of Object.keys(theme.tokens ?? {})) {
    if (!masterKeys.has(masterKey)) {
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
