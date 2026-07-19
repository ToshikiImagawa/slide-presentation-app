import { createRoot } from 'react-dom/client'
import { useCallback, useState } from 'react'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { App } from './App'
import { applyTheme, applyThemeData } from './applyTheme'
import type { PresentationData } from './data'
import { I18nProvider, loadLocales } from './i18n'
import type { LocaleResource } from './i18n'
import { loadLastSlidePackage, pickAndLoadSlidePackage } from './localSlideLoader'

type AddonManifest = {
  addons: Array<{ name: string; bundle: string }>
}

/** script タグを挿入しアドオンバンドルをロードする */
function loadAddonScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load addon: ${src}`))
    document.head.appendChild(script)
  })
}

/** manifest.json からアドオン一覧を読み込み、全バンドルをロードする */
async function loadAddons(): Promise<void> {
  try {
    const res = await fetch('/addons/manifest.json')
    if (!res.ok) return
    const manifest: AddonManifest = await res.json()
    await Promise.all(manifest.addons.map((addon) => loadAddonScript(addon.bundle)))
  } catch {
    // manifest が存在しない、またはロード失敗時はフォールバック（アドオンなし）
  }
}

/** バンドル済みデフォルトの slides.json を読み込む。存在しない場合は undefined（テンプレートガイド表示） */
async function loadBundledPresentationData(): Promise<PresentationData | undefined> {
  try {
    const res = await fetch(import.meta.env.VITE_SLIDES_PATH || '/slides.json')
    if (!res.ok) throw new Error(`${res.status}`)
    return (await res.json()) as PresentationData
  } catch {
    return undefined
  }
}

async function applyPresentationTheme(data: PresentationData | undefined): Promise<void> {
  await applyTheme(data?.meta?.themeColors)
  if (data?.theme) {
    applyThemeData(data.theme)
  }
}

interface RootProps {
  initialData: PresentationData | undefined
  locales: LocaleResource[]
}

/** 現在のプレゼンテーションデータを保持し、ローカルスライド選択時は key を更新して App を再マウントする */
function Root({ initialData, locales }: RootProps) {
  const [presentationData, setPresentationData] = useState(initialData)
  const [presentationKey, setPresentationKey] = useState(0)

  const handleOpenSlidePackage = useCallback(async () => {
    const result = await pickAndLoadSlidePackage()
    if (!result) return

    // スライド内容の更新を最優先で反映する（テーマ適用の失敗で更新がブロックされないようにする）
    setPresentationData(result.data)
    setPresentationKey((key) => key + 1)

    try {
      await applyPresentationTheme(result.data)
    } catch (error) {
      console.error('[main] テーマの適用に失敗しました', error)
    }
  }, [])

  return (
    <I18nProvider locales={locales}>
      <App key={presentationKey} presentationData={presentationData} onOpenSlidePackage={handleOpenSlidePackage} />
    </I18nProvider>
  )
}

const root = createRoot(document.getElementById('root')!)

// アドオン・言語リソースをロードし、前回開いたローカルスライド（なければバンドル済みデフォルト）を読み込んでからレンダリングする
Promise.all([loadAddons(), loadLocales()]).then(async ([, locales]) => {
  const localPackage = await loadLastSlidePackage()
  const presentationData = localPackage?.data ?? (await loadBundledPresentationData())
  await applyPresentationTheme(presentationData)
  root.render(<Root initialData={presentationData} locales={locales} />)
})
