# レイアウトリファレンス

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

利用可能アイコン: `Description`, `PlaylistAddCheck`, `Traffic`, `Memory`, `Search`

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
      "body": "'Noto Sans JP', sans-serif"
    },
    "customCSS": ".reveal h1 { text-shadow: none; }"
  }
}
```
