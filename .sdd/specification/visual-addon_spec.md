---
id: spec-visual-addon
title: ビジュアルコンポーネントのアドオン化 抽象仕様書
type: spec
status: draft
sdd-phase: specify
created: 2026-02-02
updated: 2026-07-24
depends-on:
  - prd-visual-addon
tags:
  - addon
  - visual-component
  - component-registry
  - iife-bundle
category: addon-system
---

# ビジュアルコンポーネントのアドオン化

**ドキュメント種別:** 抽象仕様書 (Spec)
**SDDフェーズ:** Specify (仕様化)
**最終更新日:** 2026-07-24
**関連 Design Doc:** [visual-addon_design.md](./visual-addon_design.md)
**関連 Spec:** [package-embedded-addon_spec.md](./package-embedded-addon_spec.md)（owner 機構・パッケージ同梱アドオンのランタイムロードへの発展先）
**関連 PRD:** [visual-addon.md](../requirement/visual-addon.md)

---

# 1. 背景

プレゼンテーションアプリケーションでは、ビジュアルコンポーネント（VibeCodingDemo, HierarchyFlowVisual, PersistenceVisual）が
`src/visuals/` に配置され、`registerDefaults.tsx` でデフォルトコンポーネントとして登録されていた。これらのビジュアルは
AI-SDD デモ用の特化コンポーネントであり、プレゼンテーション本体の汎用コンポーネントとは性質が異なるが、同じ登録経路で管理されていた。

本体コードとビジュアルの結合を解消し、独立した IIFE バンドルとしてアドオン化することで、拡張性と保守性を向上させる。

# 2. 概要

ビジュアルコンポーネントを「アドオン」という単位でグループ化し、独立した IIFE バンドルとしてビルドする。アドオンはホストアプリの `src/` ディレクトリ外（`addons/`）に配置され、独自のビルド設定を持つ。

ホストアプリは起動時に `manifest.json` を fetch し、記載されたアドオンバンドルを動的にスクリプトロードする。アドオンは `window.__ADDON_REGISTER__` グローバルコールバックを通じて ComponentRegistry の custom 側にコンポーネントを登録する。

アドオンの有効/無効は、manifest.json のエントリの追加/削除で管理する。

# 3. 要求定義

## 3.1. 機能要件 (Functional Requirements)

| ID     | 要件                                       | 優先度 | 根拠                                                       | PRD参照  |
|--------|------------------------------------------|-----|----------------------------------------------------------|--------|
| FR-001 | アドオンを独立した IIFE バンドルとしてビルドする               | 必須  | ホストアプリとの完全な分離を実現し、独立した開発・ビルドを可能にするため                   | FR-001 |
| FR-002 | アドオンのコンポーネントは registerComponent で登録する      | 必須  | 既存の ComponentRegistry を活用し、本体コードの変更を最小化して互換性を維持するため      | FR-002 |
| FR-003 | manifest.json のエントリ追加/削除で有効/無効を管理する        | 必須  | 宣言的な設定でアドオン管理を実現し、ホストアプリのソースコード変更を不要にするため              | FR-003 |
| FR-004 | 既存3ビジュアルを addons/ 配下に移動し独立バンドルとして再構成する    | 必須  | AI-SDD デモ用の特化ビジュアルを本体の汎用コンポーネントから分離し、独立管理を実現するため         | FR-004 |

## 3.2. 非機能要件 (Non-Functional Requirements)

| ID      | 要件                                          | 優先度 | 根拠                                    | PRD参照   |
|---------|---------------------------------------------|-----|---------------------------------------|---------|
| NFR-001 | アドオン化によるビルドサイズの増加は最小限に抑える                   | 推奨  | ファイル分割による overhead 以上の増加は不要           | NFR-001 |
| NFR-002 | アドオンの追加・削除は manifest.json の変更のみで完結する         | 必須  | ホストアプリのソースコード修正なしにアドオンを管理できるようにするため | NFR-002 |

## 3.3. 設計制約

| ID     | 制約                           | 根拠         | PRD参照  |
|--------|------------------------------|------------|--------|
| DC-001 | ComponentRegistry の仕組みを変更しない | 既存機能の互換性維持 | DC-001 |
| DC-002 | プレゼンテーションの表示・動作に変更がないこと      | ビジネス価値の維持  | DC-002 |

# 4. API

## 4.1. ホストアプリ側

| ディレクトリ | ファイル名                | エクスポート / 役割                     | 概要                                        |
|--------|----------------------|-----------------------------------|-------------------------------------------|
| `src`  | `addon-bridge.ts`    | `window.__ADDON_REGISTER__` セットアップ / `setCurrentAddonOwner` | アドオンがコンポーネントを登録するためのグローバルインターフェース。ロード中アドオンの owner を設定する |
| `src`  | `addonLoader.ts`     | `loadBuiltinAddons` / `loadAddonScripts` / `AddonManifest` 型 | manifest.json の fetch とアドオンスクリプトの動的ロード（owner スコープ対応・script 冪等再注入） |
| `src`  | `main.tsx`           | 起動シーケンス                          | 起動時に `loadBuiltinAddons()` を呼び、スライドパッケージ選択時に `loadAddonScripts()` を呼ぶ |

## 4.2. アドオン側

| ディレクトリ                  | ファイル名           | 役割                | 概要                             |
|-------------------------|-----------------|-------------------|--------------------------------|
| `addons/src/ai-sdd-visuals` | `entry.ts`  | 登録エントリポイント         | `window.__ADDON_REGISTER__` を呼びコンポーネントを登録 |
| `addons`                    | `vite.config.ts`| ビルド設定（自動検出方式）   | `src/*/entry.ts` 自動検出、IIFE バンドル生成、CSS インライン化、manifest 生成 |
| `addons/dist`               | `manifest.json` | アドオンメタデータ        | 有効アドオン一覧とバンドルパス                 |
| `addons/src/ai-sdd-visuals` | `*.tsx`         | ビジュアルコンポーネント     | プレゼン固有のビジュアル（3コンポーネント + icons）  |

## 4.3. グローバルインターフェース

`window.__ADDON_REGISTER__` のみ `declare global` で型宣言する。アドオンが共有する React / ReactJSXRuntime は型宣言せず、`window` へのキャスト代入で公開する（アドオン IIFE が `external` 参照として読み取る）。`RegisteredComponent` は `ComponentType<Record<string, unknown>>` のエイリアス。

```typescript
// src/addon-bridge.ts
declare global {
  interface Window {
    /** アドオンがコンポーネントを登録するためのコールバック */
    __ADDON_REGISTER__?: (
      addonName: string,
      components: Array<{ name: string; component: RegisteredComponent }>
    ) => void
  }
}

// React / ReactJSXRuntime は型宣言せずキャスト経由で公開する
;(window as unknown as Record<string, unknown>).React = React
;(window as unknown as Record<string, unknown>).ReactJSXRuntime = ReactJSXRuntime
```

## 4.4. manifest.json スキーマ

`AddonManifest` 型は `src/addonLoader.ts` で定義・エクスポートされ、ビルド時同梱アドオンとパッケージ同梱アドオンで共通に用いる。

```typescript
// src/addonLoader.ts
export type AddonManifest = {
  addons: Array<{
    name: string    // アドオン名
    bundle: string  // バンドルファイルのパス（例: "/addons/addons.iife.js"）
  }>
}
```

# 5. 用語集

| 用語                     | 説明                                                               |
|------------------------|------------------------------------------------------------------|
| アドオン（Addon）            | プレゼンテーション本体から独立した IIFE バンドルとしてパッケージされたコンポーネント群      |
| IIFE バンドル              | 即時実行関数式形式の JavaScript バンドル。ロード時に即座に実行される                   |
| manifest.json          | 有効なアドオンの一覧とバンドルパスを定義する設定ファイル                          |
| addon-bridge           | ホストアプリ側のグローバル登録インターフェース（`src/addon-bridge.ts`）          |
| `__ADDON_REGISTER__`   | アドオンがコンポーネントを登録するための `window` 上のグローバルコールバック関数           |
| ComponentRegistry      | コンポーネント名から実コンポーネントを解決するレジストリ機構                        |

# 6. 使用例

```typescript
// アドオンエントリポイント（addons/src/ai-sdd-visuals/entry.ts）
import { VibeCodingDemo } from './VibeCodingDemo'
import { HierarchyFlowVisual } from './HierarchyFlowVisual'
import { PersistenceVisual } from './PersistenceVisual'

const register = window.__ADDON_REGISTER__
if (register) {
  register('ai-sdd-visuals', [
    { name: 'VibeCodingDemo', component: VibeCodingDemo },
    { name: 'HierarchyFlowVisual', component: HierarchyFlowVisual },
    { name: 'PersistenceVisual', component: PersistenceVisual },
  ])
}
```

// manifest.json（addons/dist/manifest.json）
```json
{
  "addons": [
    {
      "name": "ai-sdd-visuals",
      "bundle": "/addons/addons.iife.js"
    }
  ]
}
```

```typescript
// ホストアプリ側の組み込みアドオンロード（src/addonLoader.ts）
export async function loadBuiltinAddons(): Promise<void> {
  const res = await fetch('/addons/manifest.json')
  if (!res.ok) return
  const manifest: AddonManifest = await res.json()
  setCurrentAddonOwner(undefined) // 組み込みアドオンは owner を持たない
  await Promise.all(manifest.addons.map((addon) => loadAddonScript(addon.bundle)))
}
```

# 7. 振る舞い図

```mermaid
sequenceDiagram
    participant Main as main.tsx
    participant Bridge as addon-bridge.ts
    participant Registry as ComponentRegistry
    participant Manifest as manifest.json
    participant Addon as addon IIFE

    Main ->> Bridge: import（グローバル登録関数をセットアップ）
    Bridge ->> Bridge: window.__ADDON_REGISTER__ を定義
    Bridge ->> Bridge: window.React, window.ReactJSXRuntime を公開
    Main ->> Main: registerDefaultComponents()
    Main ->> Manifest: loadBuiltinAddons() → fetch('/addons/manifest.json')
    Manifest -->> Main: { addons: [{ name, bundle }] }
    Main ->> Addon: <script> タグで動的ロード
    Addon ->> Addon: IIFE 即時実行（CSS インライン注入）
    Addon ->> Bridge: window.__ADDON_REGISTER__('ai-sdd-visuals', [...])
    Bridge ->> Registry: registerComponent(name, component, owner?)
    Note right of Registry: custom 層に登録（組み込みは owner=undefined。default を上書き可能）
    Main ->> Main: ReactDOM.createRoot().render(<App />)
    Note over Main, Registry: スライド描画時
    Main ->> Registry: resolveComponent(name)
    Registry -->> Main: custom → default → fallback の優先順で解決
```

# 8. 制約事項

- 既存の ComponentRegistry の解決の仕組み（`registerDefaultComponent`, `registerComponent`, `resolveComponent` の custom → default → fallback 優先順）を変更しない（A-001, A-004）。`registerComponent(name, component, owner?)` の第3引数 `owner` は後方互換なオプション拡張として追加されており、既存呼び出しと解決順序には影響しない
- TypeScript strict mode に準拠する（T-001）
- Reveal.js の DOM 構造との互換性を維持する（T-002）
- プレゼンテーションの表示品質に影響を与えない（B-001）
- アドオンは React を external 指定とし、ホストアプリの React インスタンスを共有する

---

## PRD参照

- 対応PRD: [visual-addon.md](../requirement/visual-addon.md)
- カバーする要求: UR-001, FR-001, FR-002, FR-003, FR-004, NFR-001, NFR-002, DC-001, DC-002
