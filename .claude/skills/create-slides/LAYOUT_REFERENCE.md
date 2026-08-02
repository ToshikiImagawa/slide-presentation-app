# レイアウトリファレンス

> 機械可読なスキーマ定義（AI生成プロンプト・生成専用の厳格チェックが参照する単一ソース）は
> [`schema/slide-content-schema.json`](../../../schema/slide-content-schema.json) にある。
> 本ファイルはその人間向けの詳細例であり、内容を変更する際は両者を同期させること。

## center

タイトル・まとめ用の中央寄せレイアウト。

```json
{
  "id": "slide-id",
  "layout": "center",
  "content": {
    "title": "タイトル",
    "subtitle": "サブタイトル（改行は \\n）"
  }
}
```

`variant: "section"` を指定すると SectionLayout に切り替わる:

```json
{
  "id": "slide-id",
  "layout": "center",
  "content": {
    "variant": "section",
    "title": "まとめタイトル",
    "body": "本文テキスト（改行は \\n）",
    "qrCode": "https://github.com/...",
    "githubRepo": "owner/repo"
  }
}
```

## content

コンテンツ表示用レイアウト。子要素のフィールドで描画が決まる。

### steps（Timeline）

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "ワークフロー",
    "steps": [
      { "number": 1, "title": "Step 1", "description": "説明", "command": "/optional" },
      { "number": 2, "title": "Step 2", "description": "説明" }
    ],
    "footer": "補足テキスト（オプション）"
  }
}
```

### tiles（FeatureTileGrid）

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "機能一覧",
    "tiles": [
      {
        "icon": "Description",
        "title": "タイル名",
        "description": "説明文（<br/>等HTMLタグ利用可）"
      }
    ]
  }
}
```

利用可能アイコン: `Description`, `PlaylistAddCheck`, `Traffic`, `FactCheck`, `Memory`, `Search`

### component（カスタムコンポーネント）

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "component": {
      "name": "ComponentName",
      "props": {},
      "style": { "height": "400px" }
    }
  }
}
```

## two-column

左右2カラムレイアウト。各カラムには以下を組み合わせて配置できる。

```json
{
  "id": "slide-id",
  "layout": "two-column",
  "content": {
    "title": "スライドタイトル",
    "left": {},
    "right": {}
  }
}
```

### カラムコンテンツのフィールド（すべてオプション、組み合わせ可）

```json
{
  "heading": "見出し",
  "headingDescription": "見出し補足",
  "paragraphs": ["段落1（HTMLタグ可）", "段落2"],
  "items": [
    { "text": "項目名", "emphasis": true, "description": "説明" }
  ],
  "codeBlock": {
    "header": "> ヘッダー",
    "items": ["行1", "行2"]
  },
  "titledBulletList": {
    "title": "リストタイトル",
    "items": ["項目1", "項目2"]
  },
  "accentText": "強調テキスト",
  "component": {
    "name": "ComponentName",
    "props": {},
    "style": {}
  }
}
```

`component` を指定した場合、他のフィールドは無視される。

## bleed

2カラム全幅レイアウト。左にテキスト、右にコンポーネント。

```json
{
  "id": "slide-id",
  "layout": "bleed",
  "content": {
    "title": "タイトル",
    "titleDescription": "タイトル補足",
    "commands": [
      { "text": "$ コマンド", "color": "var(--theme-text-heading)" },
      { "text": "$ コマンド2", "color": "var(--theme-primary)" }
    ],
    "component": {
      "name": "TerminalAnimation",
      "props": { "logTextUrl": "/demo-log.txt" },
      "style": { "height": "400px", "width": "90%", "margin": "auto" }
    }
  }
}
```

## custom

カスタムコンポーネントを直接描画。

```json
{
  "id": "slide-id",
  "layout": "custom",
  "content": {
    "component": {
      "name": "ComponentName",
      "props": {}
    }
  }
}
```

## 共通: meta フィールド（各スライド共通、オプション）

```json
{
  "meta": {
    "transition": "slide",
    "backgroundColor": "#1a1a2e",
    "backgroundImage": "url(/bg.png)",
    "notes": "スピーカーノート"
  }
}
```

`notes` はオブジェクト形式でも指定可能:

```json
{
  "meta": {
    "notes": {
      "speakerNotes": "発表者向けのメモや台本",
      "summary": ["要点1", "要点2"],
      "voice": "/voice/slide-01.wav"
    }
  }
}
```

## 共通: meta フィールド（トップレベル）

トップレベルの `meta` にはプレゼン全体の設定を記載する。

```json
{
  "meta": {
    "title": "プレゼンタイトル",
    "description": "概要",
    "author": "作成者",
    "logo": {
      "src": "/my-logo.png",
      "width": 150,
      "height": 50
    }
  }
}
```

`logo` を指定するとプレゼン内にロゴが表示される。`width`（デフォルト: 120）と `height`（デフォルト: 40）は省略可能。

## 共通: theme フィールド（プレゼン全体、トップレベル）

```json
{
  "theme": {
    "colors": {
      "primary": "#6c63ff",
      "background": "#0a0a1a",
      "text": "#e0e0e0"
    },
    "fonts": {
      "heading": "'Noto Sans JP', sans-serif",
      "body": "'Noto Sans JP', sans-serif",
      "code": "'Fira Code', monospace",
      "baseFontSize": 24,
      "sources": [
        { "family": "MyFont", "src": "/fonts/MyFont.woff2" },
        { "family": "Fira Code", "url": "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap" }
      ]
    },
    "customCSS": ".reveal h1 { text-shadow: none; }",
    "masters": {
      "standard": {
        "decorations": [
          { "type": "band", "anchor": "top-center", "thickness": 6, "color": "var(--theme-primary)" },
          { "type": "text", "anchor": "bottom-right", "content": "{index} / {total}", "only": "not-first" }
        ]
      }
    },
    "masterMap": {
      "content": "standard",
      "two-column": "standard"
    },
    "tokens": {
      "standard": { "band-color": "#6c63ff" }
    }
  }
}
```

`masters` は masterKey → 装飾セット（`decorations`）の定義。装飾は `logo`/`band`/`rule`/`text`/`image`/`component` の6種のみで、`anchor`（9方向）・`offset`（`{x,y}`のpx）・`only`（`first`/`last`/`not-first`/`all`。省略時 `all`）・`layer`（`back`/`front`。省略時 `back`）を組み合わせて宣言する。`text` の `content` は `{index}`/`{total}` でページ番号を展開できる。`extends` で他の masterKey の decorations を継承できる（循環参照は不可）。

`masterMap` はレイアウト種別（`center`/`content`/`two-column`/`bleed`/`custom`）→ masterKey の対応表。未指定のレイアウトには装飾を描画しない（masters/masterMap を省略したデッキは現行と完全同一のDOMになる）。

`tokens` は masterKey → CSS変数辞書。`section[data-master="masterKey"]` スコープの CSS 変数として出力される。
