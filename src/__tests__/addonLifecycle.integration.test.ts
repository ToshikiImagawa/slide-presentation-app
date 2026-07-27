import { describe, it, expect, beforeEach } from 'vitest'
import { loadAddonScripts } from '../addonLoader'
import { clearRegistry, resolveComponent, unregisterOwner, type RegisteredComponent } from '../components/ComponentRegistry'

/**
 * 実際の ComponentRegistry + addon-bridge + addonLoader を結合し、
 * パッケージ切替ライフサイクル（AC 4.5）をブラウザ非依存で自動検証する統合テスト。
 * jsdom は <script src> を実行しないため、バンドル実行（__ADDON_REGISTER__ 呼び出し）を手動で模擬する。
 */

const scriptFor = (owner: string) => `asset://localhost/${owner}/addons/a.js`

/** owner のパッケージを開く（loadAddonScripts で owner を設定 → バンドル実行を模擬 → onload 発火） */
async function openPackage(owner: string, components: Array<{ name: string; component: RegisteredComponent }>): Promise<void> {
  const src = scriptFor(owner)
  const p = loadAddonScripts([src], owner)
  // この時点で currentAddonOwner=owner。バンドルが呼ぶ登録コールバックを模擬する。
  window.__ADDON_REGISTER__!('pkg', components)
  // jsdom では onload が自動発火しないため手動で発火してロード完了させる
  document.head.querySelectorAll('script').forEach((s) => {
    if ((s as HTMLScriptElement).dataset.addonSrc === src) s.dispatchEvent(new Event('load'))
  })
  await p
}

function scriptCount(owner: string): number {
  return [...document.head.querySelectorAll('script')].filter((s) => (s as HTMLScriptElement).dataset.addonSrc === scriptFor(owner)).length
}

const WidgetA = () => null
const WidgetB = () => null

describe('アドオン切替ライフサイクル（統合）', () => {
  beforeEach(() => {
    clearRegistry()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
  })

  it('A→B→A 切替で残留・混線・同名衝突が起きない', async () => {
    // A を開く
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    expect(resolveComponent('AOnly')).toBe(WidgetA)

    // B へ切替（旧 owner を破棄してからロード）
    unregisterOwner('/pkgA')
    await openPackage('/pkgB', [{ name: 'BOnly', component: WidgetB }])
    expect(resolveComponent('BOnly')).toBe(WidgetB)
    // A のコンポーネントは残っていない（fallback）
    expect(resolveComponent('AOnly')).not.toBe(WidgetA)

    // A へ戻す
    unregisterOwner('/pkgB')
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    expect(resolveComponent('AOnly')).toBe(WidgetA)
    // B のコンポーネントは残っていない
    expect(resolveComponent('BOnly')).not.toBe(WidgetB)
  })

  it('同名コンポーネントの owner 切替で新パッケージ側が解決される', async () => {
    await openPackage('/pkgA', [{ name: 'Shared', component: WidgetA }])
    expect(resolveComponent('Shared')).toBe(WidgetA)

    unregisterOwner('/pkgA')
    await openPackage('/pkgB', [{ name: 'Shared', component: WidgetB }])
    expect(resolveComponent('Shared')).toBe(WidgetB)
  })

  it('同一パッケージの再オープンで script が二重注入されない', async () => {
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    unregisterOwner('/pkgA')
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    expect(scriptCount('/pkgA')).toBe(1)
    // 再登録もされている
    expect(resolveComponent('AOnly')).toBe(WidgetA)
  })

  it('拒否（ロードしない）でも旧 owner は破棄され、未解決は fallback になる', async () => {
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    // 拒否シナリオ: 新パッケージのアドオンはロードせず、旧 owner のみ破棄
    unregisterOwner('/pkgA')
    expect(resolveComponent('AOnly')).not.toBe(WidgetA)
  })

  it('ホーム復帰（unregisterOwner）で custom 登録がクリアされる', async () => {
    await openPackage('/pkgA', [{ name: 'AOnly', component: WidgetA }])
    unregisterOwner('/pkgA')
    expect(resolveComponent('AOnly')).not.toBe(WidgetA)
  })
})
