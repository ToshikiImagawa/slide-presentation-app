import { findNodeAtLocation, parseTree } from 'jsonc-parser'
import type { Segment } from 'jsonc-parser'

/** ValidationError.path（例: "slides[0].content.title"）を jsonc-parser の JSONPath へ変換する */
function parseErrorPath(path: string): Segment[] {
  if (!path) return []
  const segments: Segment[] = []
  const regex = /([^.[\]]+)|\[(\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(path)) !== null) {
    segments.push(match[2] !== undefined ? Number(match[2]) : match[1])
  }
  return segments
}

/**
 * ValidationError.path に対応する JSON テキスト内の文字オフセットを求める。
 * テキストが構文的に妥当でない、または path に対応する値が見つからない場合は null を返す。
 */
export function locateErrorOffset(text: string, path: string): number | null {
  const root = parseTree(text)
  if (!root) return null
  const node = findNodeAtLocation(root, parseErrorPath(path))
  return node ? node.offset : null
}
