import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { registerComponent } from './components/ComponentRegistry'
import type { RegisteredComponent } from './components/ComponentRegistry'

// アドオンバンドルが external: ['react', 'react/jsx-runtime'] で
// window.React / window.ReactJSXRuntime を参照するため、グローバルに公開する
;(window as unknown as Record<string, unknown>).React = React
;(window as unknown as Record<string, unknown>).ReactJSXRuntime = ReactJSXRuntime

// 現在ロード中のアドオンの所有者（owner）。パッケージ同梱アドオンのライフサイクル管理に使用する。
// パッケージ切替時に owner 単位でアンロードできるよう、ロード直前に addonLoader が設定する。
let currentAddonOwner: string | undefined

/** 以降に登録されるアドオンコンポーネントの owner を設定する（組み込みアドオンは undefined） */
export function setCurrentAddonOwner(owner: string | undefined): void {
  currentAddonOwner = owner
}

// アドオンバンドルが呼び出す登録コールバック
window.__ADDON_REGISTER__ = (_addonName: string, components: Array<{ name: string; component: RegisteredComponent }>) => {
  for (const { name, component } of components) {
    registerComponent(name, component, currentAddonOwner)
  }
}

declare global {
  interface Window {
    __ADDON_REGISTER__?: (addonName: string, components: Array<{ name: string; component: RegisteredComponent }>) => void
  }
}
