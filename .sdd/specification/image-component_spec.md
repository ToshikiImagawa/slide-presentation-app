---
id: spec-image-component
title: 画像表示コンポーネント 抽象仕様書
type: spec
status: draft
sdd-phase: specify
created: 2026-02-02
updated: 2026-07-24
depends-on:
  - prd-image-component
tags:
  - image
  - component-registry
  - fallback-image
  - slide-rendering
  - theme
category: ui-components
---

# 画像表示コンポーネント 抽象仕様書

**ドキュメント種別:** 抽象仕様書 (Spec)
**SDDフェーズ:** Specify (仕様化)
**最終更新日:** 2026-07-24
**関連 Design Doc:** [image-component_design.md](./image-component_design.md)
**関連 PRD:** [image-component.md](../requirement/image-component.md)

---

# 1. 背景

スライドプレゼンテーションにおいて、コンテンツ作成者がJSONデータから画像を表示したいケースがある。既存の `FallbackImage`
コンポーネントは画像表示機能を持つが、`ComponentRegistry` に登録されていないためスライドJSONの `component` フィールドから参照できない。
`FallbackImage` をラップしたコンポーネントを `ComponentRegistry` に登録することで、JSON から宣言的に画像を表示可能にする。

# 2. 概要

`Image` コンポーネントは、スライドJSON の `component` フィールドから画像を表示するためのラッパーコンポーネントである。
`FallbackImage` に画像表示とエラーハンドリングを委譲し、`ComponentRegistry` のデフォルトコンポーネントとして登録される（PRD の機能要求 FR_IMG_001）。
本仕様は PRD のユーザ要求 UR_IMG_001（スライドJSON の `component` フィールドから画像を表示できるコンポーネントを提供し、デフォルトスライドに使用例を含める）を実現する。

# 3. 要求定義

## 3.1. 機能要件 (Functional Requirements)

| ID     | 要件                                          | 優先度    | PRD参照     |
|--------|---------------------------------------------|--------|-----------|
| FR-001 | src, width, height を props で受け取り画像を表示する      | Must   | FR_IMG_002 |
| FR-002 | alt を props で受け取り代替テキストを設定する（省略時は空文字 `''`）    | Must   | FR_IMG_002 |
| FR-003 | ComponentRegistry に `Image` としてデフォルト登録される    | Must   | FR_IMG_003 |
| FR-004 | 画像読み込み失敗時に FallbackImage のエラーフォールバックを表示する    | Should | FR_IMG_004 |
| FR-005 | デフォルトスライドに `Image` コンポーネントの使用例スライドを追加する      | Should | FR_IMG_005 |

## 3.2. 非機能要件 (Non-Functional Requirements)

| ID      | カテゴリ  | 要件                                                   | 目標値                              | PRD参照      |
|---------|-------|------------------------------------------------------|----------------------------------|------------|
| NFR-001 | テーマ連動 | フォールバック表示がテーマシステムの CSS 変数と連動する                        | テーマ変更時にフォールバック UI の枠線・文字色が自動追従   | NFR_IMG_001 |
| NFR-002 | 一貫性   | `registerDefaults.tsx` の既存デフォルトコンポーネント登録パターンに従って登録される | 既存パターン（ラッパー関数 + `registerDefaultComponent`）に準拠 | NFR_IMG_002 |

# 4. API

| ディレクトリ         | ファイル名                | エクスポート                    | 概要                       |
|----------------|----------------------|---------------------------|--------------------------|
| src/components | registerDefaults.tsx | registerDefaultComponents | Image をデフォルトコンポーネントとして登録 |

## 4.1. 型定義

```typescript
/** Image コンポーネントの props */
interface ImageProps {
  /** 画像の URL */
  src: string
  /** 画像の幅（ピクセル） */
  width: number
  /** 画像の高さ（ピクセル） */
  height: number
  /** 代替テキスト（省略可。省略時は FallbackImage 側で空文字 `''` がデフォルト値として使われる） */
  alt?: string
}
```

# 5. 用語集

| 用語            | 説明                                            |
|:--------------|:----------------------------------------------|
| Image         | 本仕様で定義する画像表示コンポーネントの ComponentRegistry 登録名    |
| FallbackImage | 既存の画像表示コンポーネント。読み込みエラー時にフォールバック UI を表示する機能を持つ |

# 6. 使用例

```json
{
  "id": "image-slide",
  "layout": "content",
  "content": {
    "title": "画像表示",
    "component": {
      "name": "Image",
      "props": {
        "src": "/example.png",
        "width": 600,
        "height": 400,
        "alt": "サンプル画像"
      }
    }
  }
}
```

two-column レイアウトでの使用例:

```json
{
  "id": "image-two-column",
  "layout": "two-column",
  "content": {
    "title": "画像付きスライド",
    "left": {
      "paragraphs": [
        "画像の説明テキスト"
      ]
    },
    "right": {
      "component": {
        "name": "Image",
        "props": {
          "src": "/photo.png",
          "width": 400,
          "height": 300,
          "alt": "写真"
        }
      }
    }
  }
}
```
