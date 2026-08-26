#!/usr/bin/env node
/**
 * ドキュメント（.sdd 配下の *.md、README、CONTRIBUTING、CLAUDE.md）中の
 * バックティック囲みファイルパス参照・識別子参照が実在するかを検証する（#124, #360）。
 *
 * ドキュメントの記述と実装の乖離は人間が偶然読むまで残り続けるため、
 * 決定的に真偽が定まるパス参照・識別子参照だけを CI ゲートにする（型・シグネチャの
 * プロパティ名チェックと、自然言語の UI 位置検証は誤検知の設計課題が残るため対象外。#360）。
 *
 * 実行: node scripts/check-doc-references.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

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

// 既知集合 = src/** の宣言名（export の有無を問わない）・import 名・プロパティ名・
// ファイル名（#360）。import 名を含めることで、外部ライブラリ由来の識別子
// （React / MUI / Playwright 等）はプロジェクト内のどこかで必ず import されているため、
// 構造的に誤検知にならない。宣言名を export 有無を問わず拾うのは、ドキュメントが
// 実装の内部動作（`RootContent` のようなモジュール内部の関数等）を説明することが多く、
// export のみに限ると大半が誤検知になるため（実測で確認）。ファイル名（拡張子抜き）を
// 含めるのは、`ComponentRegistry` のようにモジュール名としての言及が最頻出のため。
// プロパティ名（interface / type のフィールド名、React の props 名）を含めるのは、
// これらの型がコンポーネント固有で export されないことが多いため。
// 「型として実装と一致するか」までは検証しない（それは Phase 2 の範囲）。
function collectNamedListSymbols(inner, known) {
  for (const rawPart of inner.split(',')) {
    const part = rawPart.trim().replace(/^type\s+/, '')
    if (!part) continue
    const asMatch = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/)
    const name = asMatch ? asMatch[2] : part
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) known.add(name)
  }
}

// 配列分割代入（`const [a, setA] = useState(...)`）・オブジェクト分割代入（リネームを除く。
// `const { fallbackLocale } = samplesManifest`）は要素先頭の識別子だけを拾えばよい
function collectDestructuredIdentifiers(inner, known) {
  for (const rawPart of inner.split(',')) {
    const nameMatch = rawPart.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)/)
    if (nameMatch) known.add(nameMatch[1])
  }
}

function collectJsSymbols(content, known) {
  for (const match of content.matchAll(/(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    known.add(match[1])
  }
  for (const match of content.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) known.add(match[1])
  for (const match of content.matchAll(/export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[;\n]/g)) known.add(match[1])
  for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) collectNamedListSymbols(match[1], known)
  for (const match of content.matchAll(/import\s*\{([^}]+)\}\s*from/g)) collectNamedListSymbols(match[1], known)
  for (const match of content.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from/g)) known.add(match[1])
  for (const match of content.matchAll(/import\s+(?:type\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*,?\s*(?:\{[^}]*\})?\s*from/g)) known.add(match[1])
  // import パスの末尾セグメント（`@mui/icons-material/FactCheck` の `FactCheck`）はアイコン名等として言及される
  for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const base = match[1].split('/').pop()
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(base)) known.add(base)
  }
  for (const match of content.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\??:\s/g)) known.add(match[1])
  // 配列分割代入（`const [scrollSpeed, setScrollSpeed] = useState(...)`）は変数名が `identifier:` の形にならない
  for (const match of content.matchAll(/const\s*\[([^\]]+)\]\s*=/g)) collectDestructuredIdentifiers(match[1], known)
  // discriminated union のタグ値（`{ type: 'scrollSpeedChange'; ... }`）は文字列リテラルで識別子ではない
  for (const match of content.matchAll(/type:\s*'([A-Za-z_$][A-Za-z0-9_$]*)'/g)) known.add(match[1])
  // オブジェクト分割代入（`const { fallbackLocale } = samplesManifest`）はプロパティ名パターン（`identifier:`）にならない
  for (const match of content.matchAll(/const\s*\{([^}]+)\}\s*=/g)) collectDestructuredIdentifiers(match[1], known)
}

// CSS の @keyframes 名（`fadeInUp` 等）はドキュメントでアニメーション名として言及される
function collectCssSymbols(content, known) {
  for (const match of content.matchAll(/@keyframes\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)) known.add(match[1])
}

function collectFileNameSymbols(files, known) {
  for (const file of files) {
    const base = file
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, '')
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(base)) known.add(base)
  }
}

function collectRustSymbols(content, known) {
  for (const match of content.matchAll(/(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    known.add(match[1])
  }
  // enum variant（`enum X { Credential(String), Err, ... }`）は PascalCase の行頭識別子として現れる
  for (const match of content.matchAll(/^\s*([A-Z][A-Za-z0-9_]*)\s*[,({]/gm)) known.add(match[1])
  // use 文のパス末尾セグメント（`use std::sync::Mutex;` の `Mutex`）は標準/外部クレートの型を拾う
  for (const match of content.matchAll(/use\s+([\w:]+)/g)) {
    const base = match[1].split('::').pop()
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) known.add(base)
  }
  // use せずフルパスで直接使う型（`std::sync::OnceLock<...>` 等）も拾う。use 文の regex は import 文だけを
  // 対象にするため、これらは既存の regex では拾えない（#390 で update_check.rs の `use std::sync::OnceLock;`
  // を削除した際、他ファイルでフルパス参照されている OnceLock が既知集合から消えドキュメント検証が壊れた）
  for (const match of content.matchAll(/(?:[A-Za-z_][A-Za-z0-9_]*::)+([A-Z][A-Za-z0-9_]*)/g)) {
    known.add(match[1])
  }
}

// JSON 設定ファイル（tauri.conf.json / tsconfig.json）のキー名・識別子形の値を拾う。
// これらはドキュメントで「設定キー」として言及されることが多く、TS/Rust の宣言収集では拾えない
function collectJsonSymbols(content, known) {
  let data
  try {
    data = JSON.parse(content)
  } catch {
    return
  }
  const stack = [data]
  while (stack.length > 0) {
    const value = stack.pop()
    if (Array.isArray(value)) stack.push(...value)
    else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        known.add(key)
        stack.push(val)
      }
    } else if (typeof value === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) known.add(value)
  }
}

// macOS の Info.plist のキー名（`NSCameraUsageDescription` 等）も tauri.conf.json と同じ宣言的な設定キーで、
// ドキュメントが設定キーとして言及する。XML なので JSON 収集では拾えない
function collectPlistSymbols(content, known) {
  for (const match of content.matchAll(/<key>\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*<\/key>/g)) known.add(match[1])
}

function listExtFiles(dir, exts) {
  return listFilesUnder(dir).filter((path) => exts.some((ext) => path.endsWith(ext)))
}

// scripts/** と vite.config.ts はビルド・CI ツールの実装であり、CONTRIBUTING.md や CLAUDE.md が
// その内部動作（関数名・変数名）を頻繁に説明するため、走査対象に含めないと allowlist が肥大化する
const EXTRA_JS_FILES = ['vite.config.ts']
const JSON_CONFIG_FILES = ['tsconfig.json', 'src-tauri/tauri.conf.json']
const PLIST_CONFIG_FILES = ['src-tauri/Info.plist']

function buildKnownSymbols() {
  const known = new Set()
  const srcFiles = listFilesUnder('src')
  const jsFiles = srcFiles.filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
  const cssFiles = srcFiles.filter((path) => path.endsWith('.css'))
  const rustFiles = listExtFiles('src-tauri/src', ['.rs'])
  const scriptFiles = listExtFiles('scripts', ['.mjs'])
  const extraJsFiles = EXTRA_JS_FILES.filter((path) => existsSync(resolve(ROOT, path)))
  for (const file of [...jsFiles, ...scriptFiles, ...extraJsFiles]) collectJsSymbols(readFileSync(resolve(ROOT, file), 'utf8'), known)
  for (const file of rustFiles) collectRustSymbols(readFileSync(resolve(ROOT, file), 'utf8'), known)
  for (const file of cssFiles) collectCssSymbols(readFileSync(resolve(ROOT, file), 'utf8'), known)
  for (const file of JSON_CONFIG_FILES.filter((path) => existsSync(resolve(ROOT, path)))) {
    collectJsonSymbols(readFileSync(resolve(ROOT, file), 'utf8'), known)
  }
  for (const file of PLIST_CONFIG_FILES.filter((path) => existsSync(resolve(ROOT, path)))) {
    collectPlistSymbols(readFileSync(resolve(ROOT, file), 'utf8'), known)
  }
  collectFileNameSymbols([...jsFiles, ...rustFiles, ...scriptFiles], known)
  return known
}

// バックティック文字列を識別子候補に絞り込む（#360）。純粋な JS 識別子の形に限ることで
// パス・CSS 変数（`--theme-primary`）・XML 名（`a:defRPr`）・kebab-case が自動的に落ちる。
// さらに大文字を含む、または `use` で始まるものに限ることで、PascalCase の型・コンポーネント・
// camelCase の関数・フックだけが対象になり、`gh` / `jq` のような短い小文字語が落ちる。
function isSymbolCandidate(text) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text) && (/[A-Z]/.test(text) || text.startsWith('use'))
}

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/doc-symbol-allowlist.json')

// 恒久的に既知集合の対象範囲外にあるシンボル（Web/Rust 標準ライブラリ、外部クレート、他アプリの
// 識別子、キーボード表記等）を理由付きで許容するための一覧（#360）。「このリポジトリ内で改名・削除
// された旧識別子への一度限りの言及」は、こちらではなく該当行に `<!-- doc-check-ignore -->` を付ける
// （DOC_CHECK_IGNORE。変更履歴の記述はドキュメントの他の場所では再利用されないため）。
// Phase 2（型のプロパティ名チェック。#375）の抑制エントリは `TypeName.propertyName` 形式のキーで
// 同じファイルに追記する（単純な識別子キーとは `.` の有無で区別でき、名前空間が競合しない）。
function loadSymbolAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {}
  return JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))
}

// ```ts フェンスのコードブロックだけを対象にする（#375）。```tsx は JSX を含む例示コードが多く、
// そこで定義される型（`type FooProps = {...}` 等）はコンポーネント固有の疑似的な説明用の型で
// 実装の同名宣言と対応しないことが多いため、誤検知抑制のため対象外にする。
// フェンス開始行自体に `<!-- doc-check-ignore -->` を付けるとそのブロックを抑制できる。
export function extractTsCodeBlocks(content) {
  const blocks = []
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^\s*```(\S+)?/)
    if (!fenceMatch) {
      i++
      continue
    }
    const isTs = fenceMatch[1] === 'ts'
    const ignore = lines[i].includes(DOC_CHECK_IGNORE)
    i++
    const codeLines = []
    while (i < lines.length && !/^\s*```/.test(lines[i])) {
      codeLines.push(lines[i])
      i++
    }
    i++ // 閉じフェンスをスキップ
    if (isTs && !ignore) blocks.push(codeLines.join('\n'))
  }
  return blocks
}

function propertyNamesOfMembers(members) {
  const names = []
  for (const member of members) {
    if ((ts.isPropertySignature(member) || ts.isMethodSignature(member)) && member.name && ts.isIdentifier(member.name)) {
      names.push(member.name.text)
    }
  }
  return names
}

// interface / type（オブジェクトリテラル型のみ）/ 関数宣言の引数（インラインオブジェクト型のみ）
// からプロパティ名を集める。ジェネリクスや交差型・ユニオン型の解決は行わない（#375 の議事: 完全一致を
// 求めると誤検知が爆発するため、直接のメンバーだけを対象にし、解決できない型は無視する）。
export function collectTypePropertyEntries(sourceFile) {
  const entries = []
  function visit(node) {
    if (ts.isInterfaceDeclaration(node)) {
      entries.push({ typeName: node.name.text, properties: propertyNamesOfMembers(node.members) })
    } else if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) {
      entries.push({ typeName: node.name.text, properties: propertyNamesOfMembers(node.type.members) })
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      for (const param of node.parameters) {
        if (param.type && ts.isTypeLiteralNode(param.type)) entries.push({ typeName: node.name.text, properties: propertyNamesOfMembers(param.type.members) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return entries
}

// ドキュメントのコードブロック1件から { typeName, properties }[] を抽出する
export function extractDocTypeProperties(code) {
  const sourceFile = ts.createSourceFile('doc-snippet.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return collectTypePropertyEntries(sourceFile).filter((entry) => entry.properties.length > 0)
}

// 実装側（src/**/*.ts(x)）の同名宣言からプロパティ名集合を構築する。同名の宣言が複数ファイルに
// 存在する場合（オーバーロード的な再定義）はプロパティ名を合算する（一方向チェックの対象を広げすぎない）
function buildImplementationTypeProperties() {
  const typeProps = new Map()
  const srcFiles = listFilesUnder('src').filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
  for (const file of srcFiles) {
    const content = readFileSync(resolve(ROOT, file), 'utf8')
    const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind)
    for (const { typeName, properties } of collectTypePropertyEntries(sourceFile)) {
      if (!typeProps.has(typeName)) typeProps.set(typeName, new Set())
      for (const name of properties) typeProps.get(typeName).add(name)
    }
  }
  return typeProps
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

// ドキュメント側の型プロパティが実装の同名型に存在しない場合を警告として返す（一方向チェック・非ゲート・#375）。
// 型名自体が実装側の集合に存在しない場合は型同定ができないため対象外にする（ドキュメント特有の
// 疑似的な説明用の型の例示を誤検知しないため。issue #375 の設計上の課題を参照）。
export function collectTypePropertyWarnings(docTypeProperties, implTypeProperties, allowlist) {
  const warnings = []
  for (const { doc, typeName, properties } of docTypeProperties) {
    const implProps = implTypeProperties.get(typeName)
    if (!implProps) continue
    for (const prop of properties) {
      if (implProps.has(prop) || Object.hasOwn(allowlist, `${typeName}.${prop}`)) continue
      warnings.push(`${doc}: 型 \`${typeName}\` のプロパティ \`${prop}\` が実装に見つかりません`)
    }
  }
  return warnings
}

function main() {
  const references = [] // { doc, text }
  const symbolCandidates = [] // { doc, text }
  const docTypeProperties = [] // { doc, typeName, properties }
  for (const doc of targetDocs()) {
    const content = readFileSync(resolve(ROOT, doc), 'utf8')
    for (const text of extractBacktickedStrings(content)) {
      if (isPathReference(text)) references.push({ doc, text })
      else if (isSymbolCandidate(text)) symbolCandidates.push({ doc, text })
    }
    for (const code of extractTsCodeBlocks(content)) {
      for (const entry of extractDocTypeProperties(code)) docTypeProperties.push({ doc, ...entry })
    }
  }

  const normalized = references.map((ref) => ({ ...ref, normalizedText: normalizePlaceholders(ref.text) }))
  const globRefs = normalized.filter((ref) => isGlobPattern(ref.normalizedText))
  const plainRefs = normalized.filter((ref) => !isGlobPattern(ref.normalizedText)).map((ref) => ({ ...ref, path: stripLineNumber(ref.normalizedText) }))

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

  const knownSymbols = buildKnownSymbols()
  const allowlist = loadSymbolAllowlist()
  const symbolFailures = []
  for (const ref of symbolCandidates) {
    if (knownSymbols.has(ref.text) || Object.hasOwn(allowlist, ref.text)) continue
    symbolFailures.push(`${ref.doc}: \`${ref.text}\` という識別子が実装（src/**・src-tauri/src/**・scripts/** と設定ファイル）に見つかりません`)
  }
  failures.push(...symbolFailures)

  const implTypeProperties = buildImplementationTypeProperties()
  const propertyWarnings = collectTypePropertyWarnings(docTypeProperties, implTypeProperties, allowlist)
  if (propertyWarnings.length > 0) {
    console.warn('[check-doc-references] 型のプロパティ名チェックで以下の警告があります（非ゲート・#375）:')
    for (const warning of propertyWarnings) console.warn(`  - ${warning}`)
  }

  if (failures.length > 0) {
    console.error('[check-doc-references] ドキュメントが参照する以下の内容が実装に存在しません:')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }

  console.log(
    `[check-doc-references] ${references.length} 件のパス参照・${symbolCandidates.length} 件の識別子参照を検証し、すべて実在を確認しました（型プロパティ警告 ${propertyWarnings.length} 件）。`,
  )
}

// 直接実行時のみ main() を走らせる（テストからの import では実行しない）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
