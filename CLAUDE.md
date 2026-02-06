# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

React + Reveal.js ベースのスライドプレゼンテーション作成ツール。JSON ファイルでスライド内容やテーマを定義し、ブラウザ上でプレゼンテーションとして表示する。

## コマンド

```bash
npm run dev          # 開発サーバー起動（アドオンビルド + Vite HMR）
npm run build        # プロダクションビルド（アドオンビルド + dist/ に出力）
npm run build:addons # アドオンのみビルド
npm run preview      # ビルド済みファイルのプレビュー
npm run format       # Prettier でコード整形（src/**/*.{ts,tsx,css}）
npm run typecheck    # TypeScript 型チェック
npm run test         # テスト実行（Vitest）
npm run test:watch   # テスト監視モード
```

## アーキテクチャ

### データ駆動型スライドシステム

スライドは React コンポーネントではなく **JSON データ**で定義する。`public/slides.json` を配置するとカスタムスライドを表示し、存在しない場合は `src/data/default-slides.json` のテンプレートガイドを表示する。

### 起動フロー

```
main.tsx
├── applyTheme()           # public/theme-colors.json から色を適用
├── loadAddons()           # addons/manifest.json → script 挿入 → ComponentRegistry に登録
├── fetch('/slides.json')  # カスタムスライドデータのロード
└── <App presentationData={data} />
    ├── registerDefaultComponents()
    ├── loadPresentationData()   # バリデーション + フォールバック
    ├── applyThemeData()         # slides.json 内の theme フィールド適用
    ├── useReveal()              # Reveal.js 初期化
    └── <SlideRenderer />        # layout に基づきスライド描画
```

### コンポーネントシステム

`ComponentRegistry` がすべてのコンポーネントを一元管理する。3つのレイヤーがある。

1. **デフォルトコンポーネント** — `registerDefaults.tsx` で登録（`TerminalAnimation`, MUI アイコン等）
2. **アドオンコンポーネント** — `window.__ADDON_REGISTER__()` 経由で登録
3. **フォールバック** — 未登録コンポーネント参照時に表示

スライド JSON から `{ "component": { "name": "Foo", "props": {} } }` で参照する。

### アドオンシステム

`addons/src/{アドオン名}/entry.ts` を自動検出し、IIFE 形式でバンドルする。`addon-bridge.ts` が `window.React` 等をグローバル公開し、アドオンから利用可能にする。ビルド時に `addons/dist/manifest.json` を自動生成。

### レイアウト

`SlideRenderer` が `layout` フィールドに基づいて描画関数を切り替える。構造ベースの5種類:

| layout | ラッパー | 用途 |
|---|---|---|
| `center` | TitleLayout / SectionLayout | タイトル・まとめ。`variant: "section"` で SectionLayout を選択 |
| `content` | ContentLayout | 子要素で描画を判別: `steps` → Timeline, `tiles` → FeatureTileGrid, `component` → カスタム |
| `two-column` | ContentLayout + TwoColumnGrid | 左右2カラム。`left`/`right` で各カラムの内容を定義 |
| `bleed` | BleedLayout | 2カラム全幅（端まで広がるレイアウト） |
| `custom` | なし | `component` で指定したコンポーネントを直接描画 |

### テーマシステム

2つの方法でカスタマイズ可能:
- `slides.json` の `theme` フィールド（色・フォント・カスタム CSS）
- `public/theme-colors.json`（色のみ）

いずれも `applyTheme.ts` が CSS 変数（`--theme-primary`, `--theme-background` 等）を `document.documentElement.style` に設定する。全色に `-rgb` 変数もあり `rgba()` で使用可能。

### スタイリング規約

- **CSS 変数**（`src/styles/global.css`）: テーマカラー・フォント定義
- **グローバル CSS**: レイアウトシステム、アニメーション（`fadeInUp`）、Reveal.js オーバーライド
- **CSS Modules**: 複雑なコンポーネント固有スタイル（`Timeline.module.css` 等）
- **MUI `sx` prop**: インラインの微調整

### コード規約

- **Prettier**: セミコロンなし、シングルクォート、末尾カンマ、印刷幅 240
- **TypeScript**: strict モード、未使用変数・パラメータをエラーとして検出

## AI-SDD Instructions (v3.0.0)

<!-- sdd-workflow version: "3.0.0" -->

このプロジェクトは AI-SDD（AI駆動仕様駆動開発）ワークフローに従います。

### ドキュメント操作

`.sdd/` ディレクトリ配下のファイルを操作する際は、`.sdd/AI-SDD-PRINCIPLES.md` を参照し、AI-SDDワークフローに準拠してください。

**トリガー条件**:

- `.sdd/` 配下のファイルの読み取りまたは変更
- 新しい仕様書、設計書、要求仕様書の作成
- `.sdd/` ドキュメントを参照する機能の実装

### ディレクトリ構造

フラット構造と階層構造の両方をサポートしています。

**フラット構造（小〜中規模プロジェクト向け）**:

    .sdd/
    |- CONSTITUTION.md               # プロジェクト原則（最上位）
    |- PRD_TEMPLATE.md               # PRDテンプレート
    |- SPECIFICATION_TEMPLATE.md     # 抽象仕様書テンプレート
    |- DESIGN_DOC_TEMPLATE.md        # 技術設計書テンプレート
    |- requirement/                  # PRD（要求仕様書）
    |   |- {feature-name}.md
    |- specification/                # 仕様書・設計書
    |   |- {feature-name}_spec.md    # 抽象仕様書
    |   |- {feature-name}_design.md  # 技術設計書
    |- task/                         # 一時タスクログ
        |- {ticket-number}/

**階層構造（中〜大規模プロジェクト向け）**:

    .sdd/
    |- CONSTITUTION.md               # プロジェクト原則（最上位）
    |- PRD_TEMPLATE.md               # PRDテンプレート
    |- SPECIFICATION_TEMPLATE.md     # 抽象仕様書テンプレート
    |- DESIGN_DOC_TEMPLATE.md        # 技術設計書テンプレート
    |- requirement/                  # PRD（要求仕様書）
    |   |- {feature-name}.md         # トップレベル機能
    |   |- {parent-feature}/         # 親機能ディレクトリ
    |       |- index.md              # 親機能概要・要求一覧
    |       |- {child-feature}.md    # 子機能要求仕様
    |- specification/                # 仕様書・設計書
    |   |- {feature-name}_spec.md    # トップレベル機能
    |   |- {feature-name}_design.md
    |   |- {parent-feature}/         # 親機能ディレクトリ
    |       |- index_spec.md         # 親機能抽象仕様書
    |       |- index_design.md       # 親機能技術設計書
    |       |- {child-feature}_spec.md   # 子機能抽象仕様書
    |       |- {child-feature}_design.md # 子機能技術設計書
    |- task/                         # 一時タスクログ
        |- {ticket-number}/

### ファイル命名規則（重要）

**注意: requirement と specification でサフィックスの有無が異なります。混同しないでください。**

| ディレクトリ            | ファイル種別 | 命名パターン                                 | 例                                         |
|:------------------|:-------|:---------------------------------------|:------------------------------------------|
| **requirement**   | 全ファイル  | `{name}.md`（サフィックスなし）                  | `user-login.md`, `index.md`               |
| **specification** | 抽象仕様書  | `{name}_spec.md`（`_spec` サフィックス必須）     | `user-login_spec.md`, `index_spec.md`     |
| **specification** | 技術設計書  | `{name}_design.md`（`_design` サフィックス必須） | `user-login_design.md`, `index_design.md` |

#### 命名パターン早見表

```
# 正しい命名
requirement/auth/index.md              # 親機能概要（サフィックスなし）
requirement/auth/user-login.md         # 子機能要求仕様（サフィックスなし）
specification/auth/index_spec.md       # 親機能抽象仕様書（_spec 必須）
specification/auth/index_design.md     # 親機能技術設計書（_design 必須）
specification/auth/user-login_spec.md  # 子機能抽象仕様書（_spec 必須）
specification/auth/user-login_design.md # 子機能技術設計書（_design 必須）

# 誤った命名（使用しないこと）
requirement/auth/index_spec.md         # requirement に _spec は不要
specification/auth/user-login.md       # specification には _spec/_design が必須
specification/auth/index.md            # specification には _spec/_design が必須
```

### ドキュメントリンク規約

ドキュメント内のマークダウンリンクは以下の形式に従ってください:

| リンク先       | 形式                                    | リンクテキスト   | 例                                                    |
|:-----------|:--------------------------------------|:----------|:-----------------------------------------------------|
| **ファイル**   | `[filename.md](パスまたはURL)`             | ファイル名を含める | `[user-login.md](../requirement/auth/user-login.md)` |
| **ディレクトリ** | `[directory-name](パスまたはURL/index.md)` | ディレクトリ名のみ | `[auth](../requirement/auth/index.md)`               |

この規約により、リンク先がファイルかディレクトリかが視覚的に明確になります。
