---
id: design-visual-addon
title: ビジュアルコンポーネントのアドオン化 技術設計書
type: design
status: draft
sdd-phase: plan
impl-status: implemented
created: 2026-02-02
updated: 2026-07-24
depends-on:
  - spec-visual-addon
tags:
  - addon
  - visual-component
  - component-registry
  - iife-bundle
category: addon-system
---

# ビジュアルコンポーネントのアドオン化

**ドキュメント種別:** 技術設計書 (Design Doc)
**SDDフェーズ:** Plan (計画/設計)
**最終更新日:** 2026-07-24
**関連 Spec:** [visual-addon_spec.md](./visual-addon_spec.md)
**関連 Design Doc:** [package-embedded-addon_design.md](./package-embedded-addon_design.md)（owner 機構・パッケージ同梱アドオンのランタイムロードへの発展先）
**関連 PRD:** [visual-addon.md](../requirement/visual-addon.md)

---

# 1. 実装ステータス

**ステータス:** 🟢 実装完了

## 1.1. 実装進捗

| モジュール/機能                                  | ステータス | 備考 |
|----------------------------------------------|----------|------|
| `addons/src/ai-sdd-visuals/entry.ts`         | 🟢       | アドオン登録エントリポイント（各アドオン内に配置） |
| `addons/vite.config.ts`                      | 🟢       | IIFE ビルド設定（自動検出方式） |
| ビジュアルファイル移動（`addons/src/ai-sdd-visuals/`）  | 🟢       | 3コンポーネント + CSS Modules + icons.tsx |
| `src/addon-bridge.ts`                        | 🟢       | グローバル登録インターフェース + `setCurrentAddonOwner` / `currentAddonOwner` 機構 |
| `src/addonLoader.ts` アドオンローダー              | 🟢       | `loadBuiltinAddons` / `loadAddonScripts`（`main.tsx` から分離）。manifest fetch + script 動的ロード（owner スコープ・冪等再注入） |
| `src/main.tsx` 起動シーケンス                     | 🟢       | 起動時に `loadBuiltinAddons()`、パッケージ選択時に `loadAddonScripts()` を呼ぶ |
| `src/components/ComponentRegistry.tsx` owner 機構 | 🟢    | `registerComponent(name, component, owner?)` / `unregisterOwner` / `customOwners` / 名前衝突警告（後方互換） |
| `src/components/registerDefaults.tsx` 修正     | 🟢       | ビジュアル3つの登録を削除 |
| `vite.config.ts` dev/prod アドオン配信設定          | 🟢       | alias + copyAddonsPlugin |
| `src/visuals/` 削除                            | 🟢       |      |

---

# 2. 設計目標

1. **本体との完全分離**: ビジュアルコンポーネントを `src/` 外の `addons/` に配置し、独立した IIFE バンドルとしてビルドする
2. **既存動作の維持**: ComponentRegistry の仕組みを変更せず、表示・動作に影響を与えない（DC-001, DC-002）
3. **宣言的管理**: アドオンの有効/無効を manifest.json で宣言的に管理し、ホストアプリのソースコード変更を不要にする（FR-003）
4. **動的ロード**: ランタイムでのスクリプト動的ロードにより、ビルド時の静的結合を排除する

---

# 3. 技術スタック

| 領域               | 採用技術                    | 選定理由                                         |
|-------------------|--------------------------|------------------------------------------------|
| アドオンビルド         | Vite（IIFE ライブラリモード）    | プロジェクト既存のビルドツールを活用。IIFE 形式で独立バンドル生成          |
| コンポーネント登録       | ComponentRegistry        | 既存の仕組みを活用し、変更を最小化（DC-001）                   |
| スタイル             | CSS Modules（JS インライン化） | 各ビジュアルが CSS Modules を使用。ビルド時に JS バンドルにインライン化  |
| ランタイムロード        | `<script>` タグ動的挿入       | 外部依存なしの最もシンプルなスクリプトロード方式                    |
| React 共有         | window グローバル経由          | ホストアプリの React インスタンスをアドオンが共有（バンドル重複回避）      |

---

# 4. アーキテクチャ

## 4.1. システム構成図

```mermaid
graph TD
    Main[main.tsx] --> Bridge[addon-bridge.ts]
    Main --> RegDef[registerDefaults.tsx]
    Main --> Loader[addonLoader.ts]
    Bridge --> Registry[ComponentRegistry]
    RegDef --> Registry
    Loader --> Manifest[manifest.json]
    Loader --> Script["&lt;script&gt; 動的ロード"]

    subgraph "addons/src/ai-sdd-visuals/"
        Script --> Entry[entry.ts]
        Entry --> VCD[VibeCodingDemo]
        Entry --> HFV[HierarchyFlowVisual]
        Entry --> PV[PersistenceVisual]
    end

    Entry -->|"window.__ADDON_REGISTER__"| Bridge

    subgraph "components/"
        RegDef --> TA[TerminalAnimation]
        RegDef --> Icons[MUI Icons]
    end

    Registry --> Slides[SlideRenderer]
```

## 4.2. モジュール分割

| モジュール名                  | 責務                                           | 依存関係                               | 配置場所                               |
|--------------------------|----------------------------------------------|-------------------------------------|---------------------------------------|
| `addon-bridge.ts`        | グローバル登録関数（`__ADDON_REGISTER__`）のセットアップ、React インスタンス公開、`setCurrentAddonOwner` によるロード中 owner 管理 | ComponentRegistry, React             | `src/addon-bridge.ts`                 |
| `addonLoader.ts`         | manifest.json の fetch とアドオンスクリプト動的ロード。`loadBuiltinAddons`（owner なし）/ `loadAddonScripts`（owner スコープ・冪等再注入）。`AddonManifest` 型を定義 | addon-bridge.ts                      | `src/addonLoader.ts`                  |
| `main.tsx`（起動シーケンス）    | 起動時に `loadBuiltinAddons()`、スライドパッケージ選択時に `loadAddonScripts()` を呼ぶ | addonLoader.ts, ComponentRegistry    | `src/main.tsx`                        |
| `ComponentRegistry.tsx`  | コンポーネントの登録・解決、owner スコープ管理（`registerComponent` の owner 引数 / `unregisterOwner` / 名前衝突警告） | React                                | `src/components/ComponentRegistry.tsx` |
| `entry.ts`               | アドオンのコンポーネントを `__ADDON_REGISTER__` 経由で登録     | 各ビジュアルコンポーネント, window グローバル         | `addons/src/ai-sdd-visuals/entry.ts`  |
| `vite.config.ts`         | アドオンの IIFE ビルド設定、自動検出、CSS インライン化、manifest 生成 | Vite                                 | `addons/vite.config.ts`               |
| ビジュアルコンポーネント（3つ）       | 各ビジュアルの描画ロジック                               | React, CSS Modules                   | `addons/src/ai-sdd-visuals/`          |

## 4.3. ディレクトリ構成

```
project-root/
├── addons/                                  # アドオンディレクトリ（src/ 外）
│   ├── vite.config.ts                       # アドオンビルド設定（自動検出方式）
│   ├── src/                                 # アドオンコンテンツ（git 管理外）
│   │   └── ai-sdd-visuals/                  # プレゼン固有ビジュアル
│   │       ├── entry.ts                     # 登録エントリポイント（規約: 各アドオンに必須）
│   │       ├── icons.tsx                    # SVG アイコンユーティリティ
│   │       ├── VibeCodingDemo.tsx
│   │       ├── VibeCodingDemo.module.css
│   │       ├── HierarchyFlowVisual.tsx
│   │       ├── HierarchyFlowVisual.module.css
│   │       ├── PersistenceVisual.tsx
│   │       └── PersistenceVisual.module.css
│   └── dist/                                # ビルド出力（git 管理外）
│       ├── addons.iife.js
│       └── manifest.json
├── src/
│   ├── addon-bridge.ts                      # グローバル登録インターフェース + setCurrentAddonOwner
│   ├── addonLoader.ts                       # アドオンローダー（loadBuiltinAddons / loadAddonScripts、AddonManifest 型）
│   ├── main.tsx                             # エントリポイント（起動シーケンス。ローダーは addonLoader.ts に分離）
│   └── components/
│       ├── ComponentRegistry.tsx             # owner スコープ管理を追加（registerComponent owner / unregisterOwner。後方互換）
│       └── registerDefaults.tsx              # ビジュアル3つの登録を削除
└── vite.config.ts                           # dev: alias, prod: copyAddonsPlugin
```

---

# 5. データモデル

論理スキーマ（`AddonManifest`・`window.__ADDON_REGISTER__`）は仕様書 [visual-addon_spec.md](./visual-addon_spec.md) の §4.3 / §4.4 を参照。本節では実装上の配置と型公開の方針のみを補足する。

- **`AddonManifest` 型の定義場所**: `src/addonLoader.ts` で `export type AddonManifest` として定義し、組み込みアドオンとパッケージ同梱アドオンで共通利用する。
- **グローバル公開の方針**: `window.__ADDON_REGISTER__` のみ `src/addon-bridge.ts` の `declare global` で型宣言する。共有 React インスタンス（`React` / `ReactJSXRuntime`）は型宣言せず、`(window as unknown as Record<string, unknown>).React = React` のようにキャスト経由で代入する（アドオン IIFE が `external` 参照として読み取る）。
- **登録コンポーネント型**: `RegisteredComponent = ComponentType<Record<string, unknown>>`（`src/components/ComponentRegistry.tsx`）。

---

# 6. インターフェース定義

## 6.1. addon-bridge.ts（ホスト側）

```typescript
// src/addon-bridge.ts
import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { registerComponent } from './components/ComponentRegistry'
import type { RegisteredComponent } from './components/ComponentRegistry'

// アドオン IIFE が external 参照するグローバル変数を公開（型宣言せずキャストで代入）
;(window as unknown as Record<string, unknown>).React = React
;(window as unknown as Record<string, unknown>).ReactJSXRuntime = ReactJSXRuntime

// 現在ロード中のアドオンの owner（組み込みアドオンは undefined）
let currentAddonOwner: string | undefined

/** 以降に登録されるアドオンコンポーネントの owner を設定する */
export function setCurrentAddonOwner(owner: string | undefined): void {
  currentAddonOwner = owner
}

// アドオン登録コールバックを定義（登録時に現在の owner を紐づける）
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
```

## 6.2. addonLoader.ts（ホスト側ローダー）

```typescript
// src/addonLoader.ts
import { setCurrentAddonOwner } from './addon-bridge'

export type AddonManifest = {
  addons: Array<{ name: string; bundle: string }>
}

// 注入済み script を src ごとに保持し、再ロード時は旧要素を除去してから再注入する（冪等）
const injectedScripts = new Map<string, HTMLScriptElement>()

function loadAddonScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    injectedScripts.get(src)?.remove()
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load addon: ${src}`))
    injectedScripts.set(src, script)
    document.head.appendChild(script)
  })
}

/** owner スコープで一連のアドオンをロードする（パッケージ同梱アドオン用） */
export async function loadAddonScripts(scripts: string[], owner: string): Promise<void> {
  if (scripts.length === 0) return
  setCurrentAddonOwner(owner)
  try {
    await Promise.all(scripts.map(loadAddonScript))
  } finally {
    setCurrentAddonOwner(undefined)
  }
}

/** ビルド時同梱の組み込みアドオン（owner なし）をロードする */
export async function loadBuiltinAddons(): Promise<void> {
  try {
    const res = await fetch('/addons/manifest.json')
    if (!res.ok) return
    const manifest: AddonManifest = await res.json()
    setCurrentAddonOwner(undefined)
    await Promise.all(manifest.addons.map((addon) => loadAddonScript(addon.bundle)))
  } catch {
    // manifest 不在・ロード失敗時はフォールバック（アドオンなし）
  }
}
```

## 6.3. entry.ts（アドオン側）

```typescript
// addons/src/ai-sdd-visuals/entry.ts
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

---

# 7. 非機能要件実現方針

| 要件                     | 実現方針                                          |
|------------------------|------------------------------------------------|
| 型安全性（T-001）           | アドオンソースは tsconfig.json の `include` に含め、型チェック対象。vite.config.ts は `exclude` |
| 表示互換性（DC-002）        | CSS Modules をビルド時に JS にインライン化。ランタイムで `<style>` タグとして注入 |
| ビルド互換性                | `npm run build:addons` で独立ビルド。メインビルドの前に実行される  |
| ビルドサイズ（NFR-001）      | React を external 指定しバンドルに含めない（重複増分 0）。CSS はインライン化し追加の配信ファイルを増やさない。**目標値**: 本体バンドル（`dist/assets/*.js`）の増分 ≤ 0 バイト（ビジュアルの分離により本体は減少）。新規配布物はアドオン IIFE（`addons.iife.js`）と `manifest.json` のみ |
| 開発者体験（NFR-002）        | manifest.json のエントリ追加/削除のみでアドオン管理。ホストアプリのソースコード変更不要 |
| dev server 対応          | `resolve.alias` で `/addons` を `addons/.../dist/` にマッピング |
| prod ビルド対応            | `copyAddonsPlugin` で `addons/.../dist/` を `dist/addons/` にコピー |

---

# 8. テスト戦略

| テストレベル | 対象                           | カバレッジ目標 |
|-----------|------------------------------|----------|
| 型チェック    | `npx tsc --noEmit`           | エラー 0件   |
| ユニットテスト | `npx vitest run`（現状 216 件・アドオンロード/owner 機構の追加分を含む） | 全件パス    |
| アドオンビルド | `npm run build:addons`       | エラー 0件、dist/ に出力 |
| ビルド      | `npm run build`              | エラー 0件、dist/addons/ にコピー |
| 表示確認    | ブラウザでの目視確認                   | 既存と同一    |

---

# 9. 設計判断

## 9.1. 決定事項

| 決定事項                   | 選択肢                                                    | 決定内容                                  | 理由                                                         |
|------------------------|--------------------------------------------------------|--------------------------------------|------------------------------------------------------------|
| アドオン配置場所              | (A) `src/addons/` (B) ルートレベル `addons/`                  | (B) ルートレベル `addons/`                  | ホストアプリの `src/` から完全に分離し、独立したビルドプロセスを明確化するため             |
| バンドル形式                | (A) ESM (B) IIFE (C) UMD                                | (B) IIFE                              | `<script>` タグでの動的ロードに最適。即時実行で登録が完了する                     |
| アドオン登録方式              | (A) static import (B) dynamic import (C) window グローバルコールバック | (C) window グローバルコールバック               | IIFE バンドルとの親和性が高い。React の共有も window 経由で自然に実現             |
| 有効/無効管理方式             | (A) import 追加/削除 (B) manifest.json (C) 環境変数             | (B) manifest.json                     | ホストアプリのソースコード変更不要。宣言的で拡張性が高い                           |
| CSS 管理方針              | (A) 外部 CSS ファイル (B) JS インライン化                           | (B) JS インライン化                         | IIFE バンドルの自己完結性を確保。追加のファイル配信設定が不要                       |
| React 共有方式            | (A) バンドルに含める (B) window グローバル経由                          | (B) window グローバル経由                    | React の重複を避け、ホストアプリとの状態共有を保証                             |
| dev server 配信方式       | (A) proxy (B) resolve alias                              | (B) resolve alias                     | 設定がシンプルで、Vite のモジュール解決と統合的に動作する                         |
| prod ビルド配信方式          | (A) public/ にコピー (B) カスタムプラグインで dist/ にコピー               | (B) カスタムプラグイン（copyAddonsPlugin）      | アドオンの dist/ をそのまま配信ディレクトリにコピー。public/ への依存を排除           |
| アドオンのライフサイクル管理       | (A) owner を持たず全アドオン恒久登録 (B) owner スコープ + `unregisterOwner`  | (B) owner スコープ管理（`registerComponent` の第3引数 owner・後方互換） | パッケージ同梱アドオン（Epic #4）でパッケージ切替時に該当アドオンのみアンロードするため。組み込みアドオンは owner=undefined で恒久登録。既存の解決順序は不変 |
| ローダーの配置                | (A) main.tsx に内包 (B) `addonLoader.ts` に分離                     | (B) `addonLoader.ts` に分離             | 組み込み（`loadBuiltinAddons`）とパッケージ同梱（`loadAddonScripts`）の2経路を単一モジュールに集約し、テスト容易性を確保 |

---

# 10. 変更履歴

## v4.0.0 (2026-07-24)

**変更内容:**

- アドオンローダーを `src/main.tsx` から `src/addonLoader.ts` に分離。`loadBuiltinAddons()`（組み込み・owner なし）と `loadAddonScripts(scripts, owner)`（owner スコープ）の2経路を提供。旧 `loadAddons()` は廃止
- `addon-bridge.ts` に `setCurrentAddonOwner` / `currentAddonOwner` 機構を追加。`__ADDON_REGISTER__` は登録時に現在の owner を紐づける
- `ComponentRegistry` に owner スコープ管理を追加: `registerComponent(name, component, owner?)` の後方互換なオプション第3引数、`unregisterOwner(owner)`、`customOwners` マップ、同名の owner 上書き時の警告。解決順序（custom → default → fallback）は不変
- script の冪等再注入を導入（同一 src の旧 `<script>` 要素を除去してから再注入し、owner 切替後の再登録を可能にする）
- ドキュメントを実装に整合: `window.React` / `window.ReactJSXRuntime` は `declare global` せずキャスト代入。`AddonManifest` 型は `src/addonLoader.ts` 定義。テスト件数を 216 件に更新

**経緯 / 依存:**

- 上記 owner 機構・`loadAddonScripts` は、スライドパッケージ同梱アドオンのランタイムロード（Epic #4、[package-embedded-addon_design.md](./package-embedded-addon_design.md)）の要件から追加された。本アドオン基盤（IIFE ローダ・`addon-bridge`・`__ADDON_REGISTER__`）を流用し、パッケージ切替時のアンロードのため owner を導入したもの

## v3.0.0 (2026-01-30)

**変更内容:**

- `addons/` 構成を再編: ビルド基盤（`vite.config.ts`）とコンテンツ（`src/`）を分離
- `addons/src/*/entry.ts` 自動検出方式に変更。手動のエントリファイル管理を不要化
- `addons/src/` を gitignore 対象に変更（プラグインコンテンツとして外部配置）
- バンドルファイル名を `ai-sdd-visuals.iife.js` から `addons.iife.js` に変更（特定アドオン名に依存しない）
- `addons/entry.ts` を廃止し、各アドオンディレクトリ内の `entry.ts` に移動

## v2.0.0 (2026-01-30)

**変更内容:**

- 設計を全面改訂: 静的 import 方式から動的 IIFE バンドル方式に移行
- アドオン配置を `src/addons/` からルートレベル `addons/` に変更
- manifest.json による宣言的アドオン管理を導入
- `window.__ADDON_REGISTER__` グローバルコールバックによる動的登録方式を導入
- `addon-bridge.ts` によるホスト/アドオン間の接続インターフェースを追加
- CSS インライン化による自己完結型バンドルを実現
- dev server / prod ビルドの配信設定を追加

## v1.1.0 (2026-01-30)

**変更内容:**

- 非機能要件実現方針に NFR-001（ビルドサイズ）、NFR-002（開発者体験）を追加

## v1.0.0 (2026-01-30)

**変更内容:**

- 初版作成
- ビジュアルコンポーネントのアドオン化設計を定義（静的 import 方式）
