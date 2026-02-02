---
name: add-slide
description: 既存のスライドプレゼンテーション（public/slides.json）に1枚のスライドを追加する。ユーザーがスライドの追加、ページ追加、スライド1枚追加を依頼したときに使用する。
argument-hint: [ 追加するスライドの内容やレイアウトの説明 ]
disable-model-invocation: true
allowed-tools: Read, Edit, Glob, Grep, Bash(npm run typecheck), Bash(npm run test), Bash(npm run dev)
---

# スライド1枚追加

`$ARGUMENTS` に基づいて `public/slides.json` に1枚のスライドを追加する。

## ワークフロー

1. **既存データの読み込み**: `public/slides.json` を読み込む。
   ファイルが存在しない場合はユーザーに `/create-slides` の使用を提案する。
2. **要件の確認**: ユーザーの説明から、追加するスライドの内容とレイアウトを決定する。不明点があれば質問する。
3. **挿入位置の決定**: 指定がなければ最後のスライドの前（まとめスライドがある場合はその前）に挿入する。
4. **スライド追加**: `public/slides.json` の `slides` 配列にスライドオブジェクトを追加する。
5. **検証**: `npm run typecheck` を実行してエラーがないことを確認する。

## スライドIDの採番

既存スライドのID命名パターンに従う。連番の場合は次の番号を使用する。

## レイアウト選択ガイド

| 用途      | レイアウト                           | 備考            |
|---------|---------------------------------|---------------|
| 表紙      | `center`                        | タイトル + サブタイトル |
| まとめ・締め  | `center` + `variant: "section"` | 本文 + QRコード等   |
| 手順・フロー  | `content` (steps)               | ステップ形式        |
| 機能・特徴紹介 | `content` (tiles)               | アイコン付きタイル     |
| 比較・詳細説明 | `two-column`                    | 左右カラム         |
| デモ・ライブ  | `bleed`                         | コマンド + ターミナル  |
| 完全カスタム  | `custom`                        | コンポーネント直接表示   |

各レイアウトのJSON構造の詳細は [../create-slides/LAYOUT_REFERENCE.md](../create-slides/LAYOUT_REFERENCE.md) を参照。

## 注意事項

- 既存スライドのスタイル・トーンに合わせる
- 追加するスライドの情報量は適度に抑え、視認性を優先する
- Edit ツールで `slides` 配列内の適切な位置にスライドオブジェクトを挿入する