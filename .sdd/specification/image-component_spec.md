# 画像表示コンポーネント

**ドキュメント種別:** 抽象仕様書 (Spec)
**SDDフェーズ:** Specify (仕様化)
**最終更新日:** 2026-01-30
**関連 Design Doc:** [image-component_design.md](./image-component_design.md)
**関連 PRD:** [image-component.md](../requirement/image-component.md)

---

# 1. 背景

スライドプレゼンテーションにおいて、コンテンツ作成者がJSONデータから画像を表示したいケースがある。既存の `FallbackImage`
コンポーネントは画像表示機能を持つが、`ComponentRegistry` に登録されていないためスライドJSONの `component` フィールドから参照できない。
`FallbackImage` をラップしたコンポーネントを `ComponentRegistry` に登録することで、JSON から宣言的に画像を表示可能にする。

# 2. 概要

`Image` コンポーネントは、スライドJSON の `component` フィールドから画像を表示するためのラッパーコンポーネントである。
`FallbackImage` に画像表示とエラーハンドリングを委譲し、`ComponentRegistry` のデフォルトコンポーネントとして登録される。

# 3. 要求定義

## 3.1. 機能要件 (Functional Requirements)

| ID     | 要件                                        | 優先度 | 根拠                         |
|--------|-------------------------------------------|-----|----------------------------|
| FR-001 | src, width, height を props で受け取り画像を表示する   | 必須  | 画像表示の基本機能 (FR_1901)        |
| FR-002 | alt を props で受け取り代替テキストを設定する（省略時はデフォルト値）  | 必須  | アクセシビリティ対応 (FR_1901)       |
| FR-003 | ComponentRegistry に `Image` としてデフォルト登録される | 必須  | JSON から参照可能にするため (FR_1902) |
| FR-004 | 画像読み込み失敗時に FallbackImage のエラーフォールバックを表示する | 推奨  | ユーザー体験の維持 (FR_1903)        |

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
  /** 代替テキスト（省略時: 空文字） */
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
