/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, extname, dirname } from 'path'
import { cpSync, existsSync, createReadStream, statSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { createRequire } from 'module'

/** addons dist to dist/addons copy plugin */
function copyAddonsPlugin(): Plugin {
  return {
    name: 'copy-addons',
    closeBundle() {
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

    // .tgz の場合は展開して使用
    if (absPath.endsWith('.tgz')) {
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

export default defineConfig({
  plugins: [react(), assetsPlugin(), slideContentPlugin(), copyAddonsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'presenter-view': resolve(__dirname, 'presenter-view.html'),
      },
    },
  },
  server: {
    fs: {
      allow: ['.', resolve(__dirname, 'addons'), resolve(__dirname, 'assets')],
    },
  },
  resolve: {
    alias: {
      '/addons': resolve(__dirname, 'addons/dist'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
