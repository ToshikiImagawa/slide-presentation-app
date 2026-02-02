---
name: create-slides
description: プレゼンテーション用のスライドJSON（public/slides.json）を一から作成する。ユーザーがスライドの作成、プレゼンの作成、slides.jsonの生成を依頼したときに使用する。
argument-hint: [プレゼンのテーマや内容の説明]
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(npm run typecheck), Bash(npm run test), Bash(npm run dev)
---

# スライド作成

`$ARGUMENTS` に基づいてプレゼンテーション用のスライドデータを `public/slides.json` に作成する。

## ワークフロー

1. **要件の確認**: ユーザーの説明から、プレゼンの目的・対象者・構成を把握する。不明点があれば質問する。
2. **構成の設計**: スライド構成（枚数・各スライドのレイアウト・流れ）を計画する。
3. **JSON作成**: `public/slides.json` にプレゼンデータを書き出す。
4. **検証**: `npm run typecheck` を実行してエラーがないことを確認する。

## 出力形式

`public/slides.json` に以下の構造で出力する:

```json
{
  "meta": {
    "title": "プレゼンタイトル",
    "description": "概要",
    "logo": {
      "src": "/logo.png",
      "width": 120,
      "height": 40
    }
  },
  "theme": {
    "colors": { "primary": "#6c63ff" }
  },
  "slides": [
    { "id": "intro", "layout": "center", "content": { "title": "..." } }
  ]
}
```

## レイアウト選択ガイド

| 用途 | レイアウト | 備考 |
|---|---|---|
| 表紙 | `center` | 最初のスライドに使用 |
| まとめ・締め | `center` + `variant: "section"` | 最後のスライドに使用 |
| 手順・フロー | `content` (steps) | ステップ形式で表示 |
| 機能・特徴紹介 | `content` (tiles) | アイコン付きタイルグリッド |
| 比較・対比 | `two-column` | 左右で異なる情報を対比 |
| 詳細説明 | `two-column` | テキスト+コード/コンポーネント |
| デモ・ライブ | `bleed` | コマンド一覧+ターミナル表示 |
| 完全カスタム | `custom` | 登録済みコンポーネント直接表示 |

各レイアウトのJSON構造の詳細は [LAYOUT_REFERENCE.md](LAYOUT_REFERENCE.md) を参照。

## 設計原則

- スライドIDは内容を表す英語のケバブケースで命名する（例: `intro`, `about`, `vibe-coding-problem`, `demo`, `closing`）
- 最初のスライドは `center` レイアウト（表紙）にする
- 最後のスライドは `center` + `variant: "section"`（まとめ）を検討する
- スライド枚数は内容に応じて適切に調整する（通常5〜15枚程度）
- 各スライドの情報量は適度に抑え、視認性を優先する
- `theme.colors` でプレゼンの雰囲気に合った配色を設定する