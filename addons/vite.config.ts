import { defineConfig, type Plugin } from 'vite'
import { writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BUNDLE_FILE = 'addons.iife.js'
const GENERATED_ENTRY = resolve(__dirname, '.entry-generated.ts')

/** アドオンエントリ (src/{name}/entry.ts) を自動検出し、アドオン名の一覧を返す */
function discoverAddons(): string[] {
  const srcDir = resolve(__dirname, 'src')
  if (!existsSync(srcDir)) return []
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(srcDir, d.name, 'entry.ts')))
    .map((d) => d.name)
}

/** 自動検出したエントリを集約するファイルを生成・削除するプラグイン */
function autoEntryPlugin(addonNames: string[]): Plugin {
  return {
    name: 'auto-entry',
    buildStart() {
      const imports = addonNames.map((name) => `import './src/${name}/entry.ts'`).join('\n')
      writeFileSync(GENERATED_ENTRY, imports + '\n')
    },
    closeBundle() {
      if (existsSync(GENERATED_ENTRY)) {
        unlinkSync(GENERATED_ENTRY)
      }
    },
  }
}

/** CSS to JS inline plugin */
function cssInlinePlugin(): Plugin {
  return {
    name: 'css-inline',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const cssChunks: string[] = []
      const cssFileNames: string[] = []

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.css') && chunk.type === 'asset') {
          cssChunks.push(chunk.source as string)
          cssFileNames.push(fileName)
        }
      }

      if (cssChunks.length === 0) return

      const cssInjection = `
(function(){
  var style = document.createElement('style');
  style.textContent = ${JSON.stringify(cssChunks.join('\n'))};
  document.head.appendChild(style);
})();`

      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code = cssInjection + '\n' + chunk.code
        }
      }

      for (const name of cssFileNames) {
        delete bundle[name]
      }
    },
  }
}

/** manifest.json generation plugin */
function manifestPlugin(addonNames: string[]): Plugin {
  return {
    name: 'addon-manifest',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      const manifest = {
        addons: addonNames.map((name) => ({
          name,
          bundle: `/addons/${BUNDLE_FILE}`,
        })),
      }
      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    },
  }
}

const addonNames = discoverAddons()

export default defineConfig({
  plugins: [autoEntryPlugin(addonNames), cssInlinePlugin(), manifestPlugin(addonNames)],
  publicDir: false,
  build: {
    lib: {
      entry: GENERATED_ENTRY,
      name: 'Addon',
      formats: ['iife'],
      fileName: () => BUNDLE_FILE,
    },
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      external: ['react', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
      },
    },
    cssCodeSplit: false,
  },
})
