import type { NormRect } from '../diagram'
import { packAxis } from './packAxis'

const MARGIN_X = 0.02
const MARGIN_Y = 0.04
const GAP_X = 0.03
const GAP_Y = 0.08

export type TreeLayoutInput = { id: string; parent?: string }

export type ResolvedTree = { roots: string[]; childrenOf: Map<string, string[]> }

/**
 * nodes[].parent から親子関係を解決する（組織図・#205）。不正な入力（存在しない親id・循環参照）
 * はルート扱いにして無限再帰やクラッシュを避ける。ツリー配置（computeTreeLayout）と、
 * 親子の接続線を引く側（OrgChart.tsx）の両方が同じ解決結果を使うことで、「ルート扱いにした
 * ノードには親への接続線を引かない」という判定がずれない。
 */
export function resolveTree(nodes: TreeLayoutInput[]): ResolvedTree {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, string[]>()
  for (const node of nodes) childrenOf.set(node.id, [])

  /** 親を辿って自分自身に戻る（循環）場合はルート扱いにする */
  function isCyclic(id: string, parent: string): boolean {
    const visited = new Set([id])
    let cursor: string | undefined = parent
    while (cursor !== undefined) {
      if (visited.has(cursor)) return true
      visited.add(cursor)
      cursor = byId.get(cursor)?.parent
    }
    return false
  }

  const roots: string[] = []
  for (const node of nodes) {
    const hasParent = node.parent !== undefined && byId.has(node.parent) && !isCyclic(node.id, node.parent)
    if (hasParent) {
      childrenOf.get(node.parent as string)!.push(node.id)
    } else {
      roots.push(node.id)
    }
  }

  return { roots, childrenOf }
}

/**
 * 組織図（#205）のツリー配置。resolveTree が導出した親子関係から、行（深さ）と列（決定的な
 * 自動配置）を導出する。乱数・力学モデルは使わない：同じ入力（配列順・親子関係）からは常に
 * 同じ配置になる（#205 の受け入れ基準）。列位置は古典的な「部分木の幅」アルゴリズム
 * （各ノードの幅＝子の幅の総和、葉は1）で決める。
 */
export function computeTreeLayout(nodes: TreeLayoutInput[]): Map<string, NormRect> {
  const result = new Map<string, NormRect>()
  if (nodes.length === 0) return result

  const { roots, childrenOf } = resolveTree(nodes)
  const rootSet = new Set(roots)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const depthCache = new Map<string, number>()
  function depthOf(id: string): number {
    if (rootSet.has(id)) return 0
    const cached = depthCache.get(id)
    if (cached !== undefined) return cached
    const parent = byId.get(id)!.parent as string
    const depth = depthOf(parent) + 1
    depthCache.set(id, depth)
    return depth
  }

  const widthCache = new Map<string, number>()
  function subtreeWidth(id: string): number {
    const cached = widthCache.get(id)
    if (cached !== undefined) return cached
    const children = childrenOf.get(id) ?? []
    const width = children.length === 0 ? 1 : children.reduce((sum, child) => sum + subtreeWidth(child), 0)
    widthCache.set(id, width)
    return width
  }

  const centerUnits = new Map<string, number>()
  function assign(id: string, start: number): void {
    centerUnits.set(id, start + subtreeWidth(id) / 2)
    let cursor = start
    for (const child of childrenOf.get(id) ?? []) {
      assign(child, cursor)
      cursor += subtreeWidth(child)
    }
  }
  let cursor = 0
  for (const root of roots) {
    assign(root, cursor)
    cursor += subtreeWidth(root)
  }
  const totalUnits = cursor

  const maxDepth = Math.max(...nodes.map((n) => depthOf(n.id)))
  const rowSlots = packAxis(maxDepth + 1, MARGIN_Y, 1 - MARGIN_Y * 2, GAP_Y)
  const extentX = 1 - MARGIN_X * 2
  const unitWidth = packAxis(totalUnits, 0, 1, GAP_X)[0]?.size ?? extentX

  for (const node of nodes) {
    const row = rowSlots[depthOf(node.id)]
    const center = MARGIN_X + ((centerUnits.get(node.id) ?? 0) / totalUnits) * extentX
    const width = unitWidth * extentX
    result.set(node.id, { x: center - width / 2, y: row.offset, w: width, h: row.size })
  }

  return result
}
