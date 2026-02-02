import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { registerComponent } from './components/ComponentRegistry'
import type { RegisteredComponent } from './components/ComponentRegistry'

// アドオンバンドルが external: ['react', 'react/jsx-runtime'] で
// window.React / window.ReactJSXRuntime を参照するため、グローバルに公開する
;(window as unknown as Record<string, unknown>).React = React
;(window as unknown as Record<string, unknown>).ReactJSXRuntime = ReactJSXRuntime

// アドオンバンドルが呼び出す登録コールバック
window.__ADDON_REGISTER__ = (_addonName: string, components: Array<{ name: string; component: RegisteredComponent }>) => {
  for (const { name, component } of components) {
    registerComponent(name, component)
  }
}

declare global {
  interface Window {
    __ADDON_REGISTER__?: (addonName: string, components: Array<{ name: string; component: RegisteredComponent }>) => void
  }
}
