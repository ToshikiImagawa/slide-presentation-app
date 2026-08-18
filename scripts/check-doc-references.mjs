#!/usr/bin/env node
/**
 * ドキュメント（.sdd 配下の *.md、README、CONTRIBUTING、CLAUDE.md）中の
 * バックティック囲みファイルパス参照が実在するかを検証する（#124）。
 *
 * ドキュメントの記述と実装の乖離は人間が偶然読むまで残り続けるため、
 * 決定的に真偽が定まるパス参照だけを CI ゲートにする（シンボル照合・Mermaid
 * エッジ解析・自然言語の UI 位置検証は誤検知の設計課題が残るため対象外）。
 *
 * 実行: node scripts/check-doc-references.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PATH_PREFIXES = ['src/', 'src-tauri/', 'scripts/', 'e2e/', 'addons/', 'schema/', 'resources/', 'samples/', '.github/']

function findMarkdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !relative(dir, path).split('/').includes('.cache'))
}

function targetDocs() {
  const fixed = ['README.md', 'README.ja.md', 'CONTRIBUTING.md', 'CONTRIBUTING.ja.md', 'CLAUDE.md']
  const sdd = findMarkdownFiles(resolve(ROOT, '.sdd')).map((path) => relative(ROOT, path))
  return [...fixed, ...sdd]
}

const DOC_CHECK_IGNORE = '<!-- doc-check-ignore -->'

// コードブロック（```...```）外のインラインコード `...` だけをパス参照の抽出対象にする。
// コードブロック内はコード例やシンボル名の説明であり、ファイルパス言及ではないことが多い。
// `<!-- doc-check-ignore -->` が付いた行は、廃止された旧パスの言及やパッケージ内相対パスなど、
// 実装との実在確認に向かない記述として除外する（誤検知の抑制。issue #124 の検討事項）。
function extractBacktickedStrings(content) {
  const results = []
  let inCodeBlock = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock || line.includes(DOC_CHECK_IGNORE)) continue
    for (const match of line.matchAll(/`([^`]+)`/g)) results.push(match[1])
  }
  return results
}

function isPathReference(text) {
  return PATH_PREFIXES.some((prefix) => text.startsWith(prefix))
}

// `<name>` や単語のみの `{name}`（カンマを含まない）はプレースホルダーであり、
// `{ja,en}` のような具体的な選択肢の列挙（brace 展開）とは別物として * に正規化する
function normalizePlaceholders(text) {
  return text.replace(/<[^<>]+>/g, '*').replace(/\{[^{},]+\}/g, '*')
}

function stripLineNumber(text) {
  return text.replace(/:\d+(-\d+)?$/, '')
}

function isGlobPattern(text) {
  return text.includes('*') || text.includes('{')
}

function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/)
  if (!match) return [pattern]
  const [full, inner] = match
  const prefix = pattern.slice(0, match.index)
  const suffix = pattern.slice(match.index + full.length)
  return inner.split(',').flatMap((option) => expandBraces(`${prefix}${option}${suffix}`))
}

function globToRegExp(pattern) {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      source += '.*'
      i++
      if (pattern[i + 1] === '/') i++
    } else if (char === '*') {
      source += '[^/]*'
    } else if ('.+^${}()|[]\\'.includes(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  return new RegExp(`^${source}$`)
}

// glob のワイルドカードより手前の固定部分だけを探索ルートにし、node_modules 等の
// 巨大ディレクトリを走査しないようにする
function globFixedRoot(pattern) {
  const fixedParts = []
  for (const part of pattern.split('/')) {
    if (part.includes('*') || part.includes('{')) break
    fixedParts.push(part)
  }
  return fixedParts.join('/')
}

function listFilesUnder(dir) {
  if (!existsSync(resolve(ROOT, dir))) return []
  return readdirSync(resolve(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)))
}

function getIgnoredSet(paths) {
  if (paths.length === 0) return new Set()
  // ディレクトリの .gitignore パターン（例: `addons/src/`）は末尾スラッシュ無しのパスに一致しないため両方試す
  const candidates = paths.flatMap((path) => (path.endsWith('/') ? [path] : [path, `${path}/`]))
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], { cwd: ROOT, input: candidates.join('\n'), encoding: 'utf8' })
    return new Set(out.split('\n').filter(Boolean))
  } catch (err) {
    // git check-ignore は無視パスが1件も無いと exit 1 になる（stdout は空でも取得できる）
    return new Set((err.stdout ?? '').split('\n').filter(Boolean))
  }
}

const gitIgnoreCache = new Map()

// 同じ glob パターンがドキュメント間で繰り返し参照されるため（例: `addons/src/*/entry.ts`）、
// root ごとに1回だけ git を呼び出し結果をキャッシュする
function isGitIgnored(path) {
  if (!gitIgnoreCache.has(path)) gitIgnoreCache.set(path, getIgnoredSet([path]).size > 0)
  return gitIgnoreCache.get(path)
}

const globMatchCache = new Map()

function matchesGlob(pattern) {
  if (globMatchCache.has(pattern)) return globMatchCache.get(pattern)
  const result = computeMatchesGlob(pattern)
  globMatchCache.set(pattern, result)
  return result
}

function computeMatchesGlob(pattern) {
  // brace 展開後に * を含まなくなった場合（例: `{ja,en}.json` → `ja.json`）は具体的な1パスなので直接判定する
  if (!pattern.includes('*')) return existsSync(resolve(ROOT, pattern))
  const root = globFixedRoot(pattern)
  // 固定部分が .gitignore 対象（例: addons/src/）だと配布物が手元に無いだけで実装は正しい可能性があるため、
  // 実在確認自体をスキップして OK とする
  if (isGitIgnored(root)) return true
  const regExp = globToRegExp(pattern)
  return listFilesUnder(root).some((path) => regExp.test(path))
}

function main() {
  const references = [] // { doc, text }
  for (const doc of targetDocs()) {
    const content = readFileSync(resolve(ROOT, doc), 'utf8')
    for (const text of extractBacktickedStrings(content)) {
      if (isPathReference(text)) references.push({ doc, text })
    }
  }

  const normalized = references.map((ref) => ({ ...ref, normalizedText: normalizePlaceholders(ref.text) }))
  const globRefs = normalized.filter((ref) => isGlobPattern(ref.normalizedText))
  const plainRefs = normalized
    .filter((ref) => !isGlobPattern(ref.normalizedText))
    .map((ref) => ({ ...ref, path: stripLineNumber(ref.normalizedText) }))

  const missingRefs = plainRefs.filter((ref) => !existsSync(resolve(ROOT, ref.path)))
  const ignoredSet = getIgnoredSet(missingRefs.map((ref) => ref.path))

  const failures = []

  for (const ref of missingRefs) {
    if (ignoredSet.has(ref.path) || ignoredSet.has(`${ref.path}/`)) continue
    failures.push(`${ref.doc}: \`${ref.text}\` が実在しません`)
  }

  for (const ref of globRefs) {
    const expanded = expandBraces(ref.normalizedText)
    const matched = expanded.some((pattern) => matchesGlob(pattern))
    if (!matched) failures.push(`${ref.doc}: \`${ref.text}\` に一致するファイルがありません`)
  }

  if (failures.length > 0) {
    console.error('[check-doc-references] ドキュメントが参照する以下のパスが実装に存在しません:')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }

  console.log(`[check-doc-references] ${references.length} 件のパス参照を検証し、すべて実在を確認しました。`)
}

main()
