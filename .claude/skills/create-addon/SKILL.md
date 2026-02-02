---
name: create-addon
description: スライドプレゼンテーション用のアドオンコンポーネントを新規作成する。ユーザーがアドオンの作成、カスタムコンポーネントの追加、ビジュアルコンポーネントの作成を依頼したときに使用する。
argument-hint: [作成するアドオンの説明（例: チャート表示、カウントダウンタイマー）]
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(npm run build:addons), Bash(npm run typecheck), Bash(npm run test), Bash(npm run dev)
---

# アドオン作成

`$ARGUMENTS` に基づいてスライドプレゼンテーション用のアドオンコンポーネントを新規作成する。

## ワークフロー

1. **要件の確認**: ユーザーの説明から、作成するコンポーネントの目的・見た目・動作を把握する。不明点があれば質問する。
2. **名前の決定**: アドオン名（ケバブケース）とコンポーネント名（パスカルケース）を決定する。
3. **ファイル作成**: 以下のファイルを `addons/src/{アドオン名}/` に作成する。
   - `entry.ts` — コンポーネント登録エントリポイント
   - `{ComponentName}.tsx` — コンポーネント実装
   - `{ComponentName}.module.css` — スタイル定義（必要な場合）
4. **ビルド検証**: `npm run build:addons` を実行してビルドが通ることを確認する。
5. **型チェック**: `npm run typecheck` を実行して型エラーがないことを確認する。
6. **使い方の案内**: スライドJSONでの参照方法をユーザーに案内する。

## 命名規約

| 対象 | 規約 | 例 |
|---|---|---|
| アドオンディレクトリ名 | ケバブケース | `countdown-timer` |
| コンポーネントファイル名 | パスカルケース | `CountdownTimer.tsx` |
| コンポーネント登録名 | パスカルケース | `CountdownTimer` |
| CSSモジュールファイル名 | パスカルケース + `.module.css` | `CountdownTimer.module.css` |

## 技術制約

- **React はグローバル参照**: アドオンは `react` と `react/jsx-runtime` を `external` としてビルドされ、`window.React` / `window.ReactJSXRuntime` を参照する。import は通常通り `import React from 'react'` と書ける。
- **外部ライブラリ不可**: `react` と `react/jsx-runtime` 以外の npm パッケージは使用できない。すべて自前で実装する。
- **CSS Module**: スタイルは CSS Module（`*.module.css`）を使用する。テーマ CSS 変数を活用する。
- **IIFE バンドル**: すべてのアドオンは1つの IIFE バンドルにまとめられる。

## コンポーネント設計指針

- **サイズ**: `width: 100%`, `height: 100%` で親要素に合わせる。スライドレイアウトがサイズを制御する。
- **テーマカラー**: `var(--theme-primary)`, `var(--theme-background)` 等の CSS 変数を使い、テーマと調和させる。
- **アニメーション**: CSS アニメーション（`@keyframes`）を推奨。JavaScript タイマーは必要最小限にする。
- **props**: `Record<string, unknown>` 型で受け取る。スライド JSON の `props` フィールドから渡される。

## テンプレートとテーマ変数

entry.ts のテンプレート、コンポーネントの実装パターン、テーマ CSS 変数の一覧は [ADDON_REFERENCE.md](ADDON_REFERENCE.md) を参照。

## スライドJSONでの使い方（案内用）

作成したコンポーネントは以下のレイアウトで使用できる:

- **`content` レイアウト**: `content.component.name` で指定
- **`custom` レイアウト**: `content.component.name` で直接描画
- **`two-column` レイアウト**: `left.component.name` または `right.component.name` で指定