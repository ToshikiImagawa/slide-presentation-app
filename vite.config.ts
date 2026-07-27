/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, extname, dirname } from 'path'
import { cpSync, existsSync, createReadStream, statSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { createRequire } from 'module'
import { isSlidePackageArchivePath } from './src/slidePackageArchive'

/**
 * 組み込みアドオン（層A）の dist を配信ディレクトリへコピーするプラグイン。
 * 層Aは dev 限定のため、release（本番）ビルドではコピーしない（#35・DC-003）。
 * ゲートはランタイムの `loadBuiltinAddons`（`import.meta.env.DEV`）と同一軸の
 * `resolved.env.DEV` で判定し、ビルドとロードのゲートを 1 つの真実源に揃える
 * （`mode` 文字列軸だと `vite build --mode development` 等で両者が乖離するため）。
 * dev server では `resolve.alias['/addons']` が addons/dist を直接配信するためコピーは不要
 * （`closeBundle` はそもそも build 時しか発火しない）。
 */
function copyAddonsPlugin(): Plugin {
  let isDev = false
  return {
    name: 'copy-addons',
    configResolved(resolved) {
      isDev = resolved.env.DEV
    },
    closeBundle() {
      if (!isDev) return
      cpSync(resolve(__dirname, 'addons/dist'), resolve(__dirname, 'dist/addons'), {
        recursive: true,
      })
    },
  }
}

/** assets directory serve (dev) + copy (build) plugin */
function assetsPlugin(): Plugin {
  const assetsDir = resolve(__dirname, 'assets')
  return {
    name: 'serve-assets',
    configureServer(server) {
      const mimeTypes: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }
      server.middlewares.use('/assets', (req, res, next) => {
        const filePath = resolve(assetsDir, (req.url ?? '/').replace(/^\//, '').split('?')[0])
        if (!existsSync(filePath) || !statSync(filePath).isFile()) return next()
        const ext = extname(filePath)
        if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext])
        res.setHeader('Content-Length', statSync(filePath).size)
        createReadStream(filePath).pipe(res)
      })
    },
    closeBundle() {
      if (existsSync(assetsDir)) {
        cpSync(assetsDir, resolve(__dirname, 'dist/assets'), { recursive: true })
      }
    },
  }
}

/** slide content package plugin — serves/copies slides from npm packages with "slidePresentation" field */
function slideContentPlugin(): Plugin {
  const require = createRequire(import.meta.url)
  const publicDir = resolve(__dirname, 'public')
  const servedPaths = ['/slides.json', '/image/', '/voice/', '/theme/', '/font/']

  function resolveLocalPath(value: string): string | null {
    const absPath = resolve(__dirname, value)
    if (!existsSync(absPath)) return null

    // .spkg（旧 .tgz）の場合は展開して使用。いずれも tar+gzip 形式で拡張子に依存しない
    if (isSlidePackageArchivePath(absPath)) {
      const extractDir = resolve(__dirname, 'node_modules/.slide-content-cache')
      if (existsSync(extractDir)) rmSync(extractDir, { recursive: true })
      mkdirSync(extractDir, { recursive: true })
      execSync(`tar -xzf "${absPath}" -C "${extractDir}"`)
      const packageDir = resolve(extractDir, 'package')
      if (existsSync(packageDir)) return packageDir
      return extractDir
    }

    // ディレクトリの場合は slides.json の存在を確認
    if (statSync(absPath).isDirectory()) {
      if (existsSync(resolve(absPath, 'slides.json'))) return absPath
    }
    return null
  }

  function findSlidePackageDir(): string | null {
    const packageValue = process.env.VITE_SLIDE_PACKAGE
    if (packageValue) {
      // ローカルパス（相対 or 絶対）の場合
      if (packageValue.startsWith('.') || packageValue.startsWith('/')) {
        const dir = resolveLocalPath(packageValue)
        if (dir) return dir
        console.warn(`[slide-content] Warning: local path not found: ${packageValue}`)
        return null
      }

      // npm パッケージ名の場合
      try {
        const pkgJsonPath = require.resolve(`${packageValue}/package.json`)
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
        if (pkg.slidePresentation) return dirname(pkgJsonPath)
      } catch {
        // パッケージが見つからない場合
      }
      return null
    }

    // @slides/* パッケージを自動検出
    const nodeModulesDir = resolve(__dirname, 'node_modules/@slides')
    if (!existsSync(nodeModulesDir)) return null
    try {
      const dirs = readdirSync(nodeModulesDir)
      for (const dir of dirs) {
        const pkgJsonPath = resolve(nodeModulesDir, dir, 'package.json')
        if (!existsSync(pkgJsonPath)) continue
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
        if (pkg.slidePresentation) return dirname(pkgJsonPath)
      }
    } catch {
      // ディレクトリ読み取りエラー
    }
    return null
  }

  let packageDir: string | null = null

  return {
    name: 'slide-content',
    config(_, env) {
      // Vite が .env.local を読み込む前に config() が呼ばれるため、手動で loadEnv する
      const envVars = loadEnv(env.mode, __dirname, 'VITE_')
      if (envVars.VITE_SLIDE_PACKAGE && !process.env.VITE_SLIDE_PACKAGE) {
        process.env.VITE_SLIDE_PACKAGE = envVars.VITE_SLIDE_PACKAGE
      }
    },
    configResolved() {
      packageDir = findSlidePackageDir()
      if (packageDir) {
        console.log(`[slide-content] Using slide package: ${packageDir}`)
      }
    },
    configureServer(server) {
      if (!packageDir) return

      const mimeTypes: Record<string, string> = {
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.css': 'text/css',
      }

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '/').split('?')[0]
        if (!servedPaths.some((p) => url === p || url.startsWith(p))) return next()

        // public/ のファイルを優先
        const publicFile = resolve(publicDir, url.replace(/^\//, ''))
        if (existsSync(publicFile) && statSync(publicFile).isFile()) return next()

        // パッケージからファイルを配信
        const pkgFile = resolve(packageDir!, url.replace(/^\//, ''))
        if (!existsSync(pkgFile) || !statSync(pkgFile).isFile()) return next()

        const ext = extname(pkgFile)
        if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext])
        res.setHeader('Content-Length', statSync(pkgFile).size)
        createReadStream(pkgFile).pipe(res)
      })
    },
    closeBundle() {
      if (!packageDir) return
      const distDir = resolve(__dirname, 'dist')

      // パッケージ内のファイル/ディレクトリをdist/にコピー（既存ファイルは上書きしない）
      const targets = ['slides.json', 'image', 'voice', 'theme', 'font']
      for (const target of targets) {
        const src = resolve(packageDir, target)
        const dest = resolve(distDir, target)
        if (!existsSync(src)) continue
        if (existsSync(dest)) {
          console.log(`[slide-content] Skipping ${target} (already exists in dist/)`)
          continue
        }
        cpSync(src, dest, { recursive: true })
        console.log(`[slide-content] Copied ${target} to dist/`)
      }
    },
  }
}

/** screenshot モード専用: ロケール別 fixture を /slides.json として配信する（Accept-Language で出し分け） */
function screenshotFixturePlugin(): Plugin {
  const fixtureFor = (lang: string) => resolve(__dirname, `scripts/screenshot/fixtures/slides.${lang}.json`)
  return {
    name: 'screenshot-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '/').split('?')[0]
        if (url !== '/slides.json') return next()
        // Accept-Language（Playwright の context locale が設定する）が ja で始まれば日本語、それ以外は英語 fixture
        const lang = (req.headers['accept-language'] ?? '').toLowerCase().startsWith('ja') ? 'ja' : 'en'
        const fixture = fixtureFor(lang)
        if (!existsSync(fixture)) return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Length', statSync(fixture).size)
        createReadStream(fixture).pipe(res)
      })
    },
  }
}

/**
 * dev サーバー限定: 同梱スライドが無いとき samples/ の配布サンプルを /slides.json として配信する。
 *
 * 配布サンプルはアプリに同梱せず GitHub Releases から取得する設計だが、それだけだと素のブラウザ（Tauri IPC なし）や
 * 未公開バージョンの開発中にサンプルを開けなくなる。真実源を samples/ の1箇所に保ったまま開発時の確認を可能にする。
 * `apply: 'serve'` なので本番ビルドの出力には一切混入しない（= バンドルから外すという目的と両立する）。
 * 相対参照（voice/...）はアプリ実行時は baseDir 基準で解決されるが dev には baseDir が無いため、ここで併せて配信する。
 */
function devSampleSlidesPlugin(): Plugin {
  const manifestPath = resolve(__dirname, 'samples/manifest.json')
  return {
    name: 'dev-sample-slides',
    apply: 'serve',
    configureServer(server) {
      // VITE_SAMPLE_SOURCE=remote のときは配信せず、リモート取得の経路を実機で確認できるようにする
      if (server.config.env.VITE_SAMPLE_SOURCE === 'remote') return
      if (!existsSync(manifestPath)) return

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        source: string
        fallbackLocale: string
        packages: Array<{ locale: string; slides: string; name: string }>
      }
      const sourceDir = resolve(__dirname, manifest.source)

      const send = (res: Parameters<Parameters<typeof server.middlewares.use>[0]>[1], filePath: string, contentType: string) => {
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', statSync(filePath).size)
        createReadStream(filePath).pipe(res)
      }

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '/').split('?')[0]

        // サンプルが参照する音声（voice/xxx.wav）。実行時は baseDir 基準で解決されるパス
        if (url.startsWith('/voice/')) {
          const relative = url.replace(/^\//, '')
          // public/ に同名ファイルがあればそちらを優先する（/slides.json と同じ規則）
          if (existsSync(resolve(__dirname, 'public', relative))) return next()
          const filePath = resolve(sourceDir, relative)
          if (!filePath.startsWith(sourceDir) || !existsSync(filePath)) return next()
          return send(res, filePath, 'audio/wav')
        }

        if (url !== '/slides.json') return next()
        // public/slides.json（Vite の静的配信）や VITE_SLIDE_PACKAGE（slideContentPlugin）を上書きしない
        if (existsSync(resolve(__dirname, 'public/slides.json'))) return next()

        const lang = (req.headers['accept-language'] ?? '').toLowerCase().split(',')[0].split('-')[0]
        const pkg = manifest.packages.find((p) => p.locale === lang) ?? manifest.packages.find((p) => p.locale === manifest.fallbackLocale)
        const filePath = pkg && resolve(sourceDir, pkg.slides)
        if (!filePath || !existsSync(filePath)) return next()
        return send(res, filePath, 'application/json')
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // スクリーンショット撮影モード。Tauri IPC をインメモリのモックへ alias 差し替えし、
  // fixture の slides.json を配信する。本番ビルド（mode !== 'screenshot'）には一切混入しない。
  const isScreenshot = mode === 'screenshot'

  return {
    // copyAddonsPlugin は内部で env.DEV をゲートし release では層Aをコピーしない（#35・DC-003）
    plugins: [react(), assetsPlugin(), slideContentPlugin(), copyAddonsPlugin(), ...(isScreenshot ? [screenshotFixturePlugin()] : [devSampleSlidesPlugin()])],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          'presenter-view': resolve(__dirname, 'presenter-view.html'),
        },
      },
    },
    server: {
      port: 1420,
      strictPort: true,
      fs: {
        allow: ['.', resolve(__dirname, 'addons'), resolve(__dirname, 'assets')],
      },
    },
    resolve: {
      alias: {
        '/addons': resolve(__dirname, 'addons/dist'),
        // screenshot モードのみ: Tauri プラグイン/API をモックへ差し替え（本番非混入）
        ...(isScreenshot
          ? {
              // plugin-store / api/event / webviewWindow のみ差し替える。
              // api/core は実物の plugin-fs / plugin-dialog が Resource/Channel を import するため
              // alias しない（対象シナリオでは core.invoke は呼ばれないので実害なし）。
              '@tauri-apps/plugin-store': resolve(__dirname, 'src/__screenshot__/tauri-store.ts'),
              '@tauri-apps/api/event': resolve(__dirname, 'src/__screenshot__/tauri-event.ts'),
              '@tauri-apps/api/webviewWindow': resolve(__dirname, 'src/__screenshot__/tauri-webview.ts'),
              '@tauri-apps/api/window': resolve(__dirname, 'src/__screenshot__/tauri-window.ts'),
            }
          : {}),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      // Vitest 対象は単体/統合テストのみ。e2e/ の Playwright spec（*.spec.ts）は除外する
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
    },
  }
})
