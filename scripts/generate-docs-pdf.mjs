#!/usr/bin/env node

/**
 * README.md / CHANGELOG.md を PDF に変換するスクリプト。
 *
 * 画像の相対パスを base64 data URI に変換してから PDF 化するため、
 * GitHub へのアクセス権がなくてもスクリーンショットが表示される。
 *
 * 生成物:
 *   docs/README.pdf
 *   docs/CHANGELOG.pdf
 *
 * 依存: puppeteer, marked (devDependency)
 *
 * md-to-pdf を使わず puppeteer + marked で直接 PDF 生成する。
 * md-to-pdf は内部で waitForNavigation({ waitUntil: 'networkidle0' }) を
 * ハードコードしており、CI 環境で外部リクエストがタイムアウトする問題があったため廃止。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import puppeteer from 'puppeteer'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs')

// --- helpers ---

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/**
 * Markdown 中の画像参照を base64 data URI に置換する。
 * - ローカルパス: ファイルを読み込んで base64 に変換
 * - 外部 URL: 1x1 透明 GIF に差し替えてネットワークリクエストを排除
 */
const inlineImages = (markdown, basePath) => {
  const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

  const replaceImagePath = (srcPath) => {
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
      return BLANK_GIF
    }
    const absPath = resolve(basePath, srcPath)
    if (!existsSync(absPath)) {
      console.warn(`  Warning: image not found: ${absPath}`)
      return srcPath
    }
    const ext = extname(absPath).toLowerCase()
    const mime = MIME_TYPES[ext] || 'application/octet-stream'
    const base64 = readFileSync(absPath).toString('base64')
    return `data:${mime};base64,${base64}`
  }

  return markdown
    .replace(/(<img\s+[^>]*?)src=["']([^"']+)["']([^>]*?>)/g, (_m, before, src, after) => {
      return `${before}src="${replaceImagePath(src)}"${after}`
    })
    .replace(/!\[([^[\]]*?)]\(([^)]+)\)/g, (_m, alt, src) => {
      return `![${alt}](${replaceImagePath(src)})`
    })
}

// --- PDF style ---

const CSS = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 100%;
}
h1 { font-size: 24px; border-bottom: 2px solid #e1e4e8; padding-bottom: 8px; }
h2 { font-size: 20px; border-bottom: 1px solid #e1e4e8; padding-bottom: 6px; }
h3 { font-size: 16px; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; }
th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
th { background: #f6f8fa; font-weight: 600; }
code { background: #f6f8fa; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #d0d7de; margin: 16px 0; padding: 8px 16px; color: #57606a; }
`

// --- Chrome path resolution ---

const resolveChromePath = async () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  try {
    return await puppeteer.executablePath()
  } catch {
    return undefined
  }
}

// --- main ---

const chromePath = await resolveChromePath()
if (chromePath) {
  if (!existsSync(chromePath)) {
    console.error(`Chrome not found at: ${chromePath}`)
    console.error('Run: npx puppeteer browsers install chrome')
    process.exit(1)
  }
  console.log(`Using Chrome: ${chromePath}`)
} else {
  console.warn('Could not resolve Chrome path — falling back to puppeteer default detection')
}

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  ...(chromePath && { executablePath: chromePath }),
})

const targets = [
  { input: 'README.md', output: 'README.pdf' },
  { input: 'README.ja.md', output: 'README.ja.pdf' },
  { input: 'CHANGELOG.md', output: 'CHANGELOG.pdf' },
  { input: 'CHANGELOG.ja.md', output: 'CHANGELOG.ja.pdf' },
]

mkdirSync(OUT_DIR, { recursive: true })

for (const { input, output } of targets) {
  const inputPath = join(ROOT, input)
  if (!existsSync(inputPath)) {
    console.warn(`Skipping ${input} (not found)`)
    continue
  }

  console.log(`Generating ${output} ...`)
  const rawMarkdown = readFileSync(inputPath, 'utf-8')
  const markdown = inlineImages(rawMarkdown, ROOT)
  const bodyHtml = await marked.parse(markdown)
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`

  try {
    const page = await browser.newPage()
    // デフォルトのナビゲーションタイムアウト（30s）を無効化
    page.setDefaultNavigationTimeout(0)

    // 外部ネットワークリクエストを全ブロック
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const url = req.url()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        req.abort()
      } else {
        req.continue()
      }
    })

    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
    })
    await page.close()

    writeFileSync(join(OUT_DIR, output), pdfBuffer)
    console.log(`  -> docs/${output}`)
  } catch (err) {
    await browser.close()
    console.error(`  Error: Failed to generate ${output}: ${err.message}`)
    process.exit(1)
  }
}

await browser.close()
console.log('Done.')
process.exit(0)
