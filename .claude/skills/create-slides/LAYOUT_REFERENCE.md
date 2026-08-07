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

コンテンツ表示用レイアウト。子要素のフィールドで描画が決まる。優先順位: `steps` → `tiles` → `images` → `component` → `body`/`items`（いずれかが指定されていたら以降は評価しない）。

### body / items（プレーン本文）

`steps`/`tiles`/`images`/`component` のいずれも指定しない場合に描画される、タイトル＋左寄せ本文の基本形。`body`（段落）と `items`（箇条書き、ネスト可）は併用できる。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "body": "本文テキスト（改行は \\n）",
    "items": [
      { "text": "項目1", "emphasis": true },
      {
        "text": "項目2",
        "items": [{ "text": "ネストした項目" }]
      },
      { "text": "後から表示したい項目", "fragment": true, "fragmentIndex": 1 }
    ]
  }
}
```

段落の語彙は `body`（単一文字列）に統一する。`two-column` の `paragraphs`（配列）とは役割が異なる: `body` は1カラム全幅の自由記述文、`paragraphs` はカラム内で複数ブロックを組み合わせる用途。

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
    "tileColumns": 3,
    "tiles": [
      {
        "icon": "Description",
        "title": "タイル名",
        "description": "説明文（<br/>等HTMLタグ利用可）",
        "accentColor": "series2"
      }
    ]
  }
}
```

`tileColumns` は列数（省略時はタイル数と同数の列＝1行表示。6枚以上のtilesを読める大きさで折返し表示したい場合に指定する）。
`accentColor` はアイコン背景・枠のアクセント色トークン名（`primary`/`accent`/`series1`〜`series6`/`success`/`warning`/`danger`/`neutral`等。省略時は`primary`）。

`icon` はComponentRegistryに `Icon:<name>` として登録済みの任意アイコン名を指定できる（アドオン・ブランドテーマ提供分を含む）。推奨（デフォルト登録済み）アイコン: `Description`, `PlaylistAddCheck`, `Traffic`, `FactCheck`, `Memory`, `Search`。未登録名は破線枠フォールバック表示＋利用者への警告になる。

### images（画像スライド）

スクリーンショット・写真・外部で作成した図を主役にするスライド。画像は縦横比を保ってセーフエリア内に自動フィットするため、寸法指定は不要（`component` の `Image` と違い手動調整しない）。枠・角丸・影はテーマトークンに追従する。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "images": [
      {
        "src": "image/screenshot.png",
        "alt": "代替テキスト",
        "caption": "画像の下に表示するキャプション（<br/>等HTMLタグ利用可）"
      }
    ]
  }
}
```

1枚指定なら本文領域いっぱいの単一画像、2〜3枚なら横並びグリッドになる（4枚以上は3列で折返し）。`src` はパッケージ内 `image/` 配下の相対パス・外部URL・data URI を指定できる。読み込みに失敗した画像は破線枠のプレースホルダになる。

### chart（チャート）

実績報告・推移説明のためのグラフ。`type` で 5 種類から選ぶ。寸法・座標の指定はなく本文領域いっぱいに自動で収まり、系列色・線幅・角丸はテーマトークンに追従する。外部で作った画像を貼る必要はない。

| type | 用途 |
|---|---|
| `bar` | 縦棒。期間ごとの推移・少数項目の比較（省略時の既定） |
| `line` | 折れ線。連続した推移 |
| `pie` | 円。構成比（`series[0].values` だけを使う） |
| `hbar` | 横棒。項目名が長い比較（施策名・部署名等） |
| `kpi` | 大数値 ＋ 推移線。1 つの指標を主役にする |

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "chart": {
      "type": "bar",
      "unit": "%",
      "categories": ["Q1", "Q2", "Q3", "Q4"],
      "series": [
        { "name": "今期", "values": [42, 51, 58, 67] },
        { "name": "前期", "values": [38, 40, 47, 52], "color": "series3" }
      ]
    }
  }
}
```

`kpi` はデータの持ち方が異なり、`value`（大数値）・`label`（見出し）・`delta`（増減注記）・`trend`（推移線の数値配列）を使う。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "chart": {
      "type": "kpi",
      "label": "月間アクティブユーザー",
      "value": 128400,
      "delta": "+18.2% 前年同月比",
      "trend": [72000, 81000, 86000, 95000, 104000, 128400]
    }
  }
}
```

表示制御は `axis`（軸の目盛りと格子線）・`legend`（凡例）・`valueLabels`（値ラベル）で、いずれも省略時は自動判定する。項目名は 12 個を超えると等間隔に間引かれ（先頭と末尾は必ず表示）、値ラベルは描画点が多いと既定で省かれるため、項目数が多くてもラベルは重ならない。軸の範囲は `min` / `max` で固定できる（百分率を 0〜100 に固定する場合等）。

`series[].color` と `kpi` の `color` は色トークン名（`series1`〜`series6`/`primary`/`accent`/`success`/`warning`/`danger`/`neutral` 等）。省略時は系列順に `series1`〜`series6` が割り当たる（円は `categories` の順）。

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
    "notes": "スピーカーノート",
    "section": "導入"
  }
}
```

`section` はそのスライドが属する章のタイトル。同じ値が**隣接して続く**スライドを1つの章として扱い、章番号（宣言順の1始まり）・開始ページ・章内枚数は自動で導出される（章の定義を別に書く必要はない）。表紙・締めのように章に属さないスライドは省略する。導出した章はマスター装飾の `text` に差し込める（後述の `{sectionNumber}` 等）。

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
    "icons": {
      "rocket": "image/icons/rocket.svg"
    },
    "customCSS": ".reveal h1 { text-shadow: none; }",
    "masters": {
      "standard": {
        "background": { "type": "grid", "size": 24 },
        "decorations": [
          { "type": "band", "anchor": "top-center", "thickness": 6, "color": "var(--theme-primary)" },
          { "type": "text", "anchor": "bottom-right", "content": "{index} / {total}", "only": "not-first" },
          { "type": "text", "anchor": "bottom-left", "content": "第 {sectionNumber:02} 章 {sectionTitle}", "only": "not-section-first" },
          { "type": "text", "anchor": "middle-center", "content": "CONFIDENTIAL", "fontSize": 96, "opacity": 0.06, "rotate": -30 }
        ]
      },
      "sectionCover": {
        "extends": "standard",
        "background": { "type": "fill", "color": "var(--theme-primary)" }
      }
    },
    "masterMap": {
      "content": "standard",
      "two-column": "standard"
    },
    "tokens": {
      "*": { "theme-radius-lg": "4px", "theme-border-width": "2px" },
      "standard": { "band-color": "#6c63ff" }
    }
  }
}
```

`masters` は masterKey → 背景意匠（`background`）と装飾セット（`decorations`）の定義。装飾は `logo`/`band`/`rule`/`text`/`image`/`component` の6種のみで、`anchor`（9方向）・`offset`（`{x,y}`のpx）・`only`（後述。省略時 `all`）・`layer`（`back`/`front`。省略時 `back`）・`opacity`（0〜1。省略時 1）・`rotate`（deg・時計回り。アンカー位置は動かさず要素の中心を軸に回す）を組み合わせて宣言する。`extends` で他の masterKey の定義を継承できる（循環参照は不可）。`decorations` は親→子の順にマージし、`background` は重ねられないため自身の定義が親より勝つ。

透かし（機密表記等）は `text`/`image` 装飾に `opacity` と `rotate` を付けて表現する。グラデーション帯は `band` に `gradient`（`{ from, to, angle }`）を指定する（`color` の代わりに使う）。斜めのストライプは `rule` に `length`（対角を覆う長さ）・`thickness`・`rotate` を指定する（辺いっぱいに伸びる `band` を回すと両端に隙間が出る）。

`background` はマスター単位の背景意匠。省略するとデッキ既定の背景（テーマ背景色＋格子）がそのまま見える。`opacity`（0〜1）を下げるとデッキ既定の背景が透ける。

| `type` | 追加プロパティ | 用途 |
|---|---|---|
| `plain` | なし | 無地（テーマ背景色で塗り、デッキ既定の格子を隠す） |
| `grid` | `color`（下地色・省略時テーマ背景色）/ `size`（格子の間隔px） | 格子（デッキ既定と同じ意匠）。`size` 省略時はデッキ既定と同じ間隔なので、密度・下地色を変えるときだけ指定する |
| `fill` | `color`（必須） | 全面塗り（章扉の反転面等） |
| `gradient` | `from` / `to`（必須）/ `angle`（deg・省略時 180 = 上→下） | グラデーション |
| `image` | `src`（必須）/ `fit`（`cover`/`contain`・省略時 `cover`） | 画像を全面に敷く |

格子線の色は `tokens` の masterKey スコープで `theme-background-grid` を上書きすればマスターごとに変えられる。

`only` は装飾を出すスライドの絞り込み条件。

| `only` | 適用されるスライド |
|---|---|
| `all` | すべて（省略時） |
| `first` / `last` | 最初 / 最後だけ |
| `not-first` | 最初以外 |
| `middle` | 最初と最後以外（表紙と締めを除く） |
| `section-first` | 各章の先頭スライドだけ（章扉） |
| `not-section-first` | 章の先頭以外（章に属さないスライドも含む） |

`text` の `content` では次のテンプレート変数を展開できる。`{sectionNumber:02}` のように `:0N` を付けると N 桁ゼロ詰めになる（`3` → `03`）。章の変数は `meta.section` を持たないスライドでは空文字になる。

| 変数 | 展開結果 |
|---|---|
| `{index}` / `{total}` | ページ番号（1始まり）/ 総ページ数 |
| `{sectionNumber}` | 章番号（1始まり） |
| `{sectionTitle}` | 章タイトル（`meta.section` の値） |
| `{sectionIndex}` / `{sectionTotal}` | 章内の連番（1始まり）/ 章内の総枚数 |

`masterMap` はレイアウト種別（`center`/`content`/`two-column`/`bleed`/`custom`）→ masterKey の対応表。未指定のレイアウトには装飾を描画しない（masters/masterMap を省略したデッキは現行と完全同一のDOMになる）。

`icons` はアイコン名 → SVGアセットパス（`image/`配下）または外部URL。ComponentRegistryに `Icon:<name>` として登録され、`content.tiles[].icon` から参照できる（ブランドテーマ提供アイコンの登録経路）。

`tokens` はスコープ → CSS変数辞書（キーは `--` を除いた変数名）。スコープは masterKey（`section[data-master="masterKey"]` スコープとして出力）または `"*"`（デッキ全体。`:root` として出力）。両方に同じ変数があれば masterKey 側が勝つ。

意匠トークン（角丸・線幅・カード内側アクセント幅・影の強さ・表のゼブラ濃度）は `"*"` から一括で変えられる。企業テンプレートは色より「角の丸み・線の細さ」で個性が出るため、色を合わせても別物に見えるときはここを調整する。

| トークン | 既定値 | 効く対象 |
|---|---|---|
| `theme-radius-sm` | `8px` | パネル・インラインコード・スライド番号の角丸 |
| `theme-radius-md` | `12px` | QRコードカード・タイルのアイコンチップの角丸 |
| `theme-radius-lg` | `16px` | カード（`tiles`）の角丸 |
| `theme-border-width` | `1px` | カード・パネルの境界線の太さ |
| `theme-card-accent-width` | `0px` | カード左端のアクセントバーの幅（`0` でバーなし。色は `tiles[].accentColor`） |
| `theme-shadow-strength` | `1` | 影の濃さの倍率（`0` で影なし・`2` で倍） |
| `theme-zebra-opacity` | `0.04` | 表の偶数行の背景の濃さ |
