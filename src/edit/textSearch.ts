export interface TextMatch {
  start: number
  end: number
}

/** 大文字小文字を無視して text 内の query に一致する範囲を全て返す */
export function findMatches(text: string, query: string): TextMatch[] {
  if (!query) return []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matches: TextMatch[] = []
  let index = lowerText.indexOf(lowerQuery)
  while (index !== -1) {
    matches.push({ start: index, end: index + query.length })
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length)
  }
  return matches
}

/** 既知の matches の位置情報を使って一致箇所をすべて replacement に置き換える（再検索は行わない） */
export function replaceAllMatches(text: string, matches: TextMatch[], replacement: string): string {
  if (matches.length === 0) return text
  let result = ''
  let cursor = 0
  for (const { start, end } of matches) {
    result += text.slice(cursor, start) + replacement
    cursor = end
  }
  return result + text.slice(cursor)
}
