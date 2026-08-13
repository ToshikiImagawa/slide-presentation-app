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

### 1枚1メッセージの variant（引用・大メッセージ・締め）

いずれもタイトルバーを持たず、中身を本文領域の中央に主役として置く。章の切り替えや結びに使い、本文を詰め込まない。

`variant: "quote"` — 引用。大きな引用符と出典の区切り（`—`）は装飾として自動で付くので本文には書かない。

```json
{
  "id": "slide-id",
  "layout": "center",
  "content": {
    "variant": "quote",
    "quote": "引用文（改行は \\n）",
    "citation": "出典（人名・書名等）"
  }
}
```

`variant: "message"` — 大メッセージ（淡色地。デッキ既定の背景に短い主張を1つ）。`body` は任意の補足。

```json
{
  "id": "slide-id",
  "layout": "center",
  "content": {
    "variant": "message",
    "message": "短い主張（改行は \\n）",
    "body": "補足（1行程度）"
  }
}
```

`variant: "message-inverse"` — 大メッセージの全面塗り。**塗り色と文字色はスライド側では指定せず、テーマの `masters[].background`（`type: "fill"`）と `tokens` の masterKey スコープで持つ**（`masterMap` の `"center/message-inverse"` から解決する）。両者のコントラストは WCAG AA で自動検証されるため、この組み合わせで指定する（スライド側やコンポーネント CSS で塗ると検証から外れる）。

そのため **マスターを割り当てていないデッキでは `message` と同じ見た目になる**（塗りはテーマの担当で、スライド側は「反転面である」ことだけを宣言する）。反転面を使うなら `theme.masters` / `theme.masterMap` / `theme.tokens` を併せて書く。ブランドテーマ取り込み（PPT/Google スライド由来）は現状この枠にマスターを割り当てないので、同じく手書きする必要がある。

`variant: "closing"` — 締め。結びの一言に連絡先（`qrCode` / `githubRepo`）を添えられる。マスターの全面塗りやロゴの全面配置（`decorations` の `logo`）と組み合わせて終わる。

```json
{
  "id": "slide-id",
  "layout": "center",
  "content": {
    "variant": "closing",
    "message": "ありがとうございました",
    "body": "質問はこちらへ",
    "qrCode": "https://github.com/..."
  }
}
```

## content

コンテンツ表示用レイアウト。子要素のフィールドで描画が決まる。優先順位: `steps` → `checklist` → `toc` → `tiles` → `images` → `chart` → `table` → `compare` → `flow` → `component` → `body`/`items`（いずれかが指定されていたら以降は評価しない）。`toc`（目次）は末尾の節を参照。

### body / items（プレーン本文）

`steps`/`checklist`/`tiles`/`images`/`chart`/`table`/`compare`/`flow`/`component` のいずれも指定しない場合に描画される、タイトル＋左寄せ本文の基本形。`body`（段落）と `items`（箇条書き、ネスト可）は併用できる。

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

`stepColumns` を指定すると、連結線を持たない**多列の番号付きリスト**になる（1〜3列 × 複数行。範囲外の値は丸める）。横1列で読めるのは6件までなので、7件以上はこちらを使う（項目は「番号バッジ＋見出し＋説明」の横並びになり、行数に応じて行間・説明文の文字サイズが自動で詰まる）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "作業手順",
    "stepColumns": 2,
    "steps": [
      { "number": 1, "title": "Step 1", "description": "説明" },
      { "number": 2, "title": "Step 2", "description": "説明" }
    ]
  }
}
```

### checklist（チェックリスト）

完了記号＋項目＋説明を縦に並べる。リリース前確認・要件確認のように「済／未」を見せる用途に使う。記号は済が丸に `✓`（success 色）・未が角丸の空枠（neutral 色）で、色と形の両方で状態を示す（記号の意匠はテーマトークンに追従する）。項目数に応じて行間・文字サイズが自動で詰まる（推奨上限7件）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "リリース前チェック",
    "checklist": [{ "title": "テストが通った", "description": "説明（<br/>等HTMLタグ利用可）", "checked": true }, { "title": "CI が緑になった" }]
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

| type   | 用途                                                 |
| ------ | ---------------------------------------------------- |
| `bar`  | 縦棒。期間ごとの推移・少数項目の比較（省略時の既定） |
| `line` | 折れ線。連続した推移                                 |
| `pie`  | 円。構成比（`series[0].values` だけを使う）          |
| `hbar` | 横棒。項目名が長い比較（施策名・部署名等）           |
| `kpi`  | 大数値 ＋ 推移線。1 つの指標を主役にする             |

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

複数の指標を横に並べる KPI 行にしたい場合は `items`（2〜5個）を使う。`items` を指定すると `value`/`label`/`delta`/`trend`/`color` の単体フィールドは無視される（`items` が無いときの単体 KPI は `items` 長さ1 として同じ経路で描画されるので、書式が変わるだけで挙動は同じ）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "chart": {
      "type": "kpi",
      "items": [
        { "label": "売上成長率", "value": 24.6, "unit": "%", "delta": "+3.1pt", "deltaDirection": "up", "deltaStatus": "success" },
        { "label": "新規契約数", "value": 342, "delta": "+6.5%", "deltaDirection": "up", "deltaStatus": "success", "color": "series3" },
        { "label": "解約率", "value": 3.1, "unit": "%", "delta": "+0.4pt", "deltaDirection": "up", "deltaStatus": "danger", "color": "series4" },
        { "label": "NPS", "value": 42, "delta": "±0", "deltaDirection": "flat", "deltaStatus": "neutral", "color": "series5" }
      ]
    }
  }
}
```

増減注記の見た目は `deltaDirection`（`up`/`down`/`flat`。▲/▼/– の記号）と `deltaStatus`（色トークン。省略時はその指標の `color` と同じ）の2フィールドで決める。方向（数値が上下したか）と状態（それが良いか悪いか）は別の軸なので分離している。上の例の「解約率」は `deltaDirection: "up"` だが `deltaStatus: "danger"`（解約率の増加は悪い変化）。

表示制御は `axis`（軸の目盛りと格子線）・`legend`（凡例）・`valueLabels`（値ラベル）で、いずれも省略時は自動判定する。項目名は 12 個を超えると等間隔に間引かれ（先頭と末尾は必ず表示）、値ラベルは描画点が多いと既定で省かれるため、項目数が多くてもラベルは重ならない。軸の範囲は `min` / `max` で固定できる（百分率を 0〜100 に固定する場合等）。

`series[].color` と `kpi` の `color`/`deltaStatus`（`items[].color`/`items[].deltaStatus` も同様）は色トークン名（`series1`〜`series6`/`primary`/`accent`/`success`/`warning`/`danger`/`neutral` 等）。省略時は系列順に `series1`〜`series6` が割り当たる（円は `categories` の順）。

`content.chart` の短縮記法は `layout: content` 専用だが、`Chart` は ComponentRegistry にも登録されているため `component: { name: "Chart", props: {...} }`（`props` は上記と同じフィールド）でも置ける。two-column の各カラム（`left.component`/`right.component`）・bleed・custom など、`component` を受け付けるすべての経路から使え、チャートと箇条書きを左右に並べるレイアウトも組める。

`type` の綴りミス・`categories`/`series` が両方空・`kpi` で `value`/`trend` が両方無い・未知の色トークン名は、いずれの経路で指定してもトースト表示（開発中）と AI 自動修復のフィードバックに載る（`getThemeWarnings`）。

### table（表）

比較表・マイルストーン表・仕様表等のためのヘッダー行＋本文行の表。寸法・座標の指定はなく本文領域いっぱいに自動で収まり、罫線・ゼブラ・ヘッダ行の塗り・角丸はテーマトークンに追従する。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "table": {
      "columns": [
        { "label": "項目", "align": "left", "width": 2 },
        { "label": "Free", "align": "center" },
        { "label": "Pro", "align": "center" }
      ],
      "rows": [
        ["価格", "0円", "1,200円/月"],
        ["ユーザー数", "1", "10"]
      ]
    }
  }
}
```

`columns[].align`（`left`/`center`/`right`。省略時 `left`）と `columns[].width`（列幅の比率。省略時は全列等分）で列ごとの見た目を調整する。`rows[]` の各要素は `columns` と同じ順序・数のセル文字列配列。行数・列数が多い場合はpadding・文字サイズが段階的に縮み、それでも収まらない分は本文領域の外へはみ出させずクリップする。

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

`name` はComponentRegistryに登録済みの名前を指定する。デフォルト登録済み: `TerminalAnimation`, `Image`, `Diagram`, `Chart`, `Table`, `Compare`, `Flow`, `Checklist`, `HierarchyDiagram`, `ServerDiagram`, `OrgChart`, `ClassDiagram`, `Flowchart`, `Swimlane`, `Gantt`, `TwoByTwoMatrix`, `Funnel`, `Swot`, `Heatmap`（アドオン・ブランドテーマが追加登録する名前も指定できる。アイコンは `Icon:<name>` という別のネームスペースで登録され対象外）。

`Chart`/`Table`/`Compare`/`HierarchyDiagram`/`ServerDiagram`/`OrgChart`/`ClassDiagram`/`Flowchart`/`Swimlane`/`Gantt`/`TwoByTwoMatrix`/`Funnel`/`Swot`/`Heatmap` は同名の短縮記法（`content.chart`/`content.table`/`content.twoByTwo` 等）でも描けるが、ComponentRegistry にも登録されているため `component: { name: "Table", props: {...} }`（`props` は各短縮記法のオブジェクトと同じフィールド）でも同じ見た目で置ける。`Flow`/`Checklist` も同様に置けるが、短縮記法（`content.flow`/`content.checklist`）はフィールド値がオブジェクトではなく配列そのものなので、`props` はその配列をそれぞれ `steps`/`items` に包んだ形（`{ "steps": [...] }`/`{ "items": [...] }`）になる。`Checklist` はさらに、短縮記法側が `description` 内のHTMLタグ（`<b>` 等）を解釈するのに対し、`component` 経由ではそのまま文字列として表示される差がある（`description` にHTMLタグを含めない場合は差が出ない）。いずれも two-column の各カラム（`left.component`/`right.component`）・bleed・custom など `component` を受け付けるすべての経路から使え、表と箇条書きを左右に並べるレイアウトも組める（#241/#274）。

### compare（比較）

可否・採用/非採用・Before/After 等の2ペイン比較。左右ペインの高さは自動で揃う。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "compare": {
      "left": {
        "heading": "採用する",
        "items": [
          { "text": "既存トークンを再利用する", "status": "pass" },
          { "text": "新規CSS変数を追加しない", "status": "pass" }
        ]
      },
      "right": {
        "heading": "採用しない",
        "items": [{ "text": "色値のハードコード", "status": "fail" }, { "text": "検証は手動のみ", "status": "warn" }, { "text": "対象外の項目" }]
      }
    }
  }
}
```

各ペインの `items[].status` は状態記号・状態色を出す（省略時は記号なしの通常項目）。

| `status`  | 記号 | 色トークン |
| --------- | ---- | ---------- |
| `pass`    | ✓    | `success`  |
| `fail`    | ✕    | `danger`   |
| `warn`    | !    | `warning`  |
| `neutral` | –    | `neutral`  |

### flow（横フロー）

工程の連なりを「左から右への流れ」で見せる横フロー。3〜5工程を想定し、工程間の矢印は自動でカード境界に接する（矢印プリミティブは `src/components/diagram/` の共通部品を再利用しており、#200 では再実装しない）。カード幅・文字サイズは工程数から自動で決まる。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "タイトル",
    "flow": [{ "title": "要件定義", "description": "課題を洗い出す" }, { "title": "実装" }, { "title": "レビュー" }, { "title": "リリース", "description": "本番反映" }]
  }
}
```

### 構成図（階層構成図・サーバ/クラウド構成図・組織図・UMLクラス図・#205）

4種の構成図はいずれも `src/components/diagram/` の共通プリミティブ（#202）に座標を渡す層として実装されており、ノード/エッジのデータ構造を共有する（種別ごとに独自DSLを作らない。`schema/slide-content-schema.json` の `structureNode`/`structureEdge` が単一ソース）。配置は「配列順による明示指定」または「決定的な自動配置」のいずれかで決まり、乱数・力学モデルは使わない。矢印・コネクタはノードの境界に自動で接する。

#### hierarchyDiagram（階層構成図）

層を上から下へ積む構造図。層の配列順がそのまま配置の明示指定になる（自動配置は使わない）。隣接する層同士は自動で線を結ぶ。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "3層アーキテクチャ",
    "hierarchyDiagram": {
      "layers": [
        { "title": "プレゼンテーション層", "description": "Web UI・モバイルアプリ" },
        { "title": "ビジネス層", "description": "API・ドメインロジック" },
        { "title": "データ層", "description": "RDB・キャッシュ" }
      ]
    }
  }
}
```

#### serverDiagram（サーバ/クラウド構成図）

ゾーン（サブネット等の枠）ごとにノードを横一列に並べる。ゾーン・ノードの配列順がそのまま配置の明示指定になる。ゾーンをまたぐノード間の接続は `connections` で id 同士を結ぶ。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "サーバ構成",
    "serverDiagram": {
      "zones": [
        { "title": "パブリックサブネット", "nodes": [{ "id": "lb", "label": "ロードバランサ" }] },
        {
          "title": "プライベートサブネット",
          "nodes": [
            { "id": "app1", "label": "APIサーバ" },
            { "id": "app2", "label": "APIサーバ" }
          ]
        },
        { "title": "データ層", "nodes": [{ "id": "db", "label": "RDS" }] }
      ],
      "connections": [
        { "from": "lb", "to": "app1" },
        { "from": "lb", "to": "app2" },
        { "from": "app1", "to": "db" },
        { "from": "app2", "to": "db" }
      ]
    }
  }
}
```

#### orgChart（組織図・体制図）

`nodes[].parent` で親子関係を明示指定すると、行（親からの深さ）と列位置（決定的な自動配置。乱数・力学モデルは使わない）が自動で決まる。親子の接続線も自動で引く。`parent` を省略したノードはルート（複数可）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "組織図",
    "orgChart": {
      "nodes": [
        { "id": "ceo", "label": "CEO" },
        { "id": "cto", "label": "CTO", "parent": "ceo" },
        { "id": "coo", "label": "COO", "parent": "ceo" },
        { "id": "eng", "label": "エンジニアリング部長", "parent": "cto" }
      ]
    }
  }
}
```

#### classDiagram（UMLクラス図）

属性・メソッドを持つクラスボックスと関係線。`classes[].row`/`col` を指定すると明示配置、省略時は決定的な自動グリッド配置になる。`relations[].type`（association/inheritance/implements/dependency）で関係線の見た目の既定値（実線/破線・矢印/三角）が決まる。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "クラス図",
    "classDiagram": {
      "classes": [
        { "id": "user", "label": "User", "attributes": ["id: string", "name: string"], "methods": ["login(): void"] },
        { "id": "admin", "label": "Admin", "attributes": ["role: string"] }
      ],
      "relations": [{ "from": "admin", "to": "user", "type": "inheritance" }]
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
  "items": [{ "text": "項目名", "emphasis": true, "description": "説明" }],
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

`component` に「本文領域を埋めるコンポーネント」（`Diagram` など、登録時に残り高さを埋めると宣言したもの）を置くと、そのカラムが本文領域の残り高さをコンポーネントへ渡す。左右のカラムで独立に解決するため、片方だけ図解にして反対側にテキストを置ける。

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

`backgroundColor`/`backgroundImage` を指定したスライドは、そのスライドの `theme.masters[key].background`（後述）を描かず、個別指定が勝つ（#236）。本編・発表者ビュー・編集プレビュー・PDF書き出しの4経路すべてで同じ見た目になる（マスター背景と同じ層で描くため）。

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

`background` はマスター単位の背景意匠。省略するとデッキ既定の背景（テーマ背景色＋格子）がそのまま見える。`opacity`（0〜1）を下げるとデッキ既定の背景が透ける。**そのスライドに `meta.backgroundColor`/`backgroundImage`（前述の共通 meta フィールド）があるときは、この `background` を描かず個別指定が勝つ**（#236）。

| `type`     | 追加プロパティ                                                | 用途                                                                                                          |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `plain`    | なし                                                          | 無地（テーマ背景色で塗り、デッキ既定の格子を隠す）                                                            |
| `grid`     | `color`（下地色・省略時テーマ背景色）/ `size`（格子の間隔px） | 格子（デッキ既定と同じ意匠）。`size` 省略時はデッキ既定と同じ間隔なので、密度・下地色を変えるときだけ指定する |
| `fill`     | `color`（必須）                                               | 全面塗り（章扉の反転面等）                                                                                    |
| `gradient` | `from` / `to`（必須）/ `angle`（deg・省略時 180 = 上→下）     | グラデーション                                                                                                |
| `image`    | `src`（必須）/ `fit`（`cover`/`contain`・省略時 `cover`）     | 画像を全面に敷く                                                                                              |

`plain`/`grid`（`color` 省略時）に加え、`gradient` の半透明部分・`image` の `fit: contain` の余白の下地も既定でテーマ背景色になる（#239。真実源は `global.css` の `.master-background`）。

格子線の色は `tokens` の masterKey スコープで `theme-background-grid` を上書きすればマスターごとに変えられる。

`only` は装飾を出すスライドの絞り込み条件。

| `only`              | 適用されるスライド                         |
| ------------------- | ------------------------------------------ |
| `all`               | すべて（省略時）                           |
| `first` / `last`    | 最初 / 最後だけ                            |
| `not-first`         | 最初以外                                   |
| `middle`            | 最初と最後以外（表紙と締めを除く）         |
| `section-first`     | 各章の先頭スライドだけ（章扉）             |
| `not-section-first` | 章の先頭以外（章に属さないスライドも含む） |

`text` の `content` では次のテンプレート変数を展開できる。`{sectionNumber:02}` のように `:0N` を付けると N 桁ゼロ詰めになる（`3` → `03`）。章の変数は `meta.section` を持たないスライドでは空文字になる。

| 変数                                | 展開結果                            |
| ----------------------------------- | ----------------------------------- |
| `{index}` / `{total}`               | ページ番号（1始まり）/ 総ページ数   |
| `{sectionNumber}`                   | 章番号（1始まり）                   |
| `{sectionTitle}`                    | 章タイトル（`meta.section` の値）   |
| `{sectionIndex}` / `{sectionTotal}` | 章内の連番（1始まり）/ 章内の総枚数 |

`masterMap` はレイアウト種別（`center`/`content`/`two-column`/`bleed`/`custom`）→ masterKey の対応表。未指定のレイアウトには装飾を描画しない（masters/masterMap を省略したデッキは現行と完全同一のDOMになる）。

`icons` はアイコン名 → SVGアセットパス（`image/`配下）または外部URL。ComponentRegistryに `Icon:<name>` として登録され、`content.tiles[].icon` から参照できる（ブランドテーマ提供アイコンの登録経路）。

`tokens` はスコープ → CSS変数辞書（キーは `--` を除いた変数名）。スコープは masterKey（`section[data-master="masterKey"]` スコープとして出力）または `"*"`（デッキ全体。`:root` として出力）。両方に同じ変数があれば masterKey 側が勝つ。

意匠トークン（角丸・線幅・装飾線の太さ・カード内側アクセント幅・影の強さ・表のゼブラ濃度）は `"*"` から一括で変えられる。企業テンプレートは色より「角の丸み・線の太さ」で個性が出るため、色を合わせても別物に見えるときはここを調整する。

| トークン                        | 既定値  | 効く対象                                                                     |
| ------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `theme-radius-sm`               | `8px`   | パネル・インラインコード・スライド番号の角丸                                 |
| `theme-radius-md`               | `12px`  | QRコードカード・タイルのアイコンチップの角丸                                 |
| `theme-radius-lg`               | `16px`  | カード（`tiles`）の角丸                                                      |
| `theme-border-width`            | `1px`   | カード・パネルのヘアライン境界線の太さ（装飾的な太線は下の 5 つで制御する）  |
| `theme-heading-accent-width`    | `6px`   | スライド見出し左端のアクセントバーの太さ                                     |
| `theme-heading-underline-width` | `1.5px` | 見出し直下の下線の太さ（`bleed` レイアウトの見出し）                         |
| `theme-frame-rule-width`        | `4px`   | スライド上端に走るブランド帯の太さ                                           |
| `theme-rule-width`              | `4px`   | 本文中の装飾的な区切り線の太さ（`steps` を貫く水平線）                       |
| `theme-node-ring-width`         | `3px`   | 番号バッジを囲むリングの太さ（`steps` のノード）                             |
| `theme-card-accent-width`       | `0px`   | カード左端のアクセントバーの幅（`0` でバーなし。色は `tiles[].accentColor`） |
| `theme-shadow-strength`         | `1`     | 影の濃さの倍率（`0` で影なし・`2` で倍）                                     |
| `theme-zebra-opacity`           | `0.04`  | 表の偶数行の背景の濃さ                                                       |

### content.toc（目次・#195）

`layout: content` の `content.toc` で目次を描画する。`items` を省略すると各スライドの `meta.section`（共通 meta フィールドの節を参照）から導出した章の章番号・章タイトル・開始ページ番号を自動導出し、章の追加・削除・並べ替えに追従する。開始ページは各章の先頭スライドの位置（0始まり）+1（Reveal のページ表示と同じ1始まり）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "目次",
    "toc": {}
  }
}
```

`numberFormat` で章番号の書式を指定できる。マスター装飾の `text` と同じ `{sectionNumber}` / `{sectionNumber:0N}`（N桁ゼロ詰め）記法で、省略時は `"{sectionNumber}"`（ゼロ詰めなし）。

```json
{
  "content": {
    "toc": { "numberFormat": "第{sectionNumber:02}章" }
  }
}
```

章の概念を使わないデッキでは `items` で手書きの目次項目リストを指定する（後方互換）。指定すると章からの自動導出は使わない。`number`（章番号として表示する文字列。省略すると番号なしの行になる）・`title`・`page`（開始ページ番号として表示する値）を持つ。

```json
{
  "content": {
    "toc": {
      "items": [
        { "number": "01", "title": "導入", "page": 3 },
        { "number": "02", "title": "設計", "page": 12 }
      ]
    }
  }
}
```

`columns`（1〜3。範囲外は丸める）で列数を指定できる。省略時は1列（縦一列）。章・項目数が多い場合に2〜3列へ折返す。両モード共通で、項目数（多列時は行数）に応じて行間・文字サイズが自動で詰まる。

### プロセス図（フローチャート・スイムレーン・日付タイムライン・ガント・#206）

工程・時間軸を示す図式。フローチャート・スイムレーンはノード/エッジのデータ構造（`structureNode`/`structureEdge`）を構成図（#205）と共有し、日付タイムラインは既存の `steps`（Timeline）と見た目の基盤を共有する（`steps` の描画は変わらず、併存する独立フィールド）。

#### dateTimeline（日付付きマイルストーンタイムライン）

`steps`（連番）と同じ横1列の連結線つきタイムラインで、バッジの中身が番号ではなく日付になる。日付は等間隔配置で、実際の日付差には比例させない（近接した日付が並んでも密集して読めなくならないようにするための設計判断）。日付は短い表記を推奨する。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "マイルストーン",
    "dateTimeline": [
      { "date": "2026/01", "title": "要件確定", "description": "スコープを固定" },
      { "date": "2026/03", "title": "実装完了" },
      { "date": "2026/04", "title": "リリース", "description": "本番反映" }
    ]
  }
}
```

#### flowchart（フローチャート）

開始/処理/判断/終了のノード種別は `nodes[].shape`（`start`/`process`/`decision`/`end`。省略時は `process` 相当の矩形）で指定する。`start`/`end` は端が丸いピル形、`decision` はひし形で表示される。分岐（1つのノードから複数の `edges`）・合流（複数の `edges` が1つのノードへ集まる）はいずれも通常の `edges` を複数指定するだけで表現でき、専用のデータ構造は無い。`nodes[].row`/`col` を指定すると明示配置、省略時は決定的な自動グリッド配置（classDiagram と同じ）になる。分岐・合流を綺麗に見せるには row/col を明示指定するのが基本形。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "承認フロー",
    "flowchart": {
      "nodes": [
        { "id": "start", "label": "申請", "shape": "start", "row": 0, "col": 1 },
        { "id": "check", "label": "承認する?", "shape": "decision", "row": 1, "col": 1 },
        { "id": "approve", "label": "承認処理", "shape": "process", "row": 2, "col": 0 },
        { "id": "reject", "label": "却下通知", "shape": "process", "row": 2, "col": 2 },
        { "id": "end", "label": "完了", "shape": "end", "row": 3, "col": 1 }
      ],
      "edges": [
        { "from": "start", "to": "check" },
        { "from": "check", "to": "approve", "label": "Yes" },
        { "from": "check", "to": "reject", "label": "No" },
        { "from": "approve", "to": "end" },
        { "from": "reject", "to": "end" }
      ]
    }
  }
}
```

#### swimlane（スイムレーン）

レーン（担当）を上から下へ積み、フェーズ（工程）は全レーン共通の列として揃える（同じ工程を誰が担当しているかを縦に比較できる）。各レーンの `nodes[].col` で列位置を明示指定でき、省略時はレーン内の配列順が列位置になる。レーンをまたぐ接続は `connections` で id 同士を結ぶ。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "リリースプロセス",
    "swimlane": {
      "phases": ["設計", "実装", "レビュー", "リリース"],
      "lanes": [
        { "title": "PM", "nodes": [{ "id": "req", "label": "要件定義", "col": 0 }] },
        {
          "title": "エンジニア",
          "nodes": [
            { "id": "impl", "label": "実装", "col": 1 },
            { "id": "fix", "label": "修正", "col": 2 }
          ]
        },
        {
          "title": "QA",
          "nodes": [
            { "id": "review", "label": "レビュー", "col": 2 },
            { "id": "release", "label": "リリース", "col": 3 }
          ]
        }
      ],
      "connections": [
        { "from": "req", "to": "impl" },
        { "from": "impl", "to": "review" },
        { "from": "review", "to": "fix" },
        { "from": "fix", "to": "release" }
      ]
    }
  }
}
```

#### gantt（ガント）

行=工程、列=時間軸の単位（`axis`）の表形式。時間軸は実カレンダー日付ではなく離散的な列で表す（発表内容ごとに時間粒度が違い、日付演算の複雑さに対して得られる恩恵が小さいための設計判断）。各工程は `startCol`（開始列・0始まり）と `span`（期間の列数。省略時1）で期間バーの位置と長さを指定する。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "スケジュール",
    "gantt": {
      "axis": ["1月", "2月", "3月", "4月"],
      "tasks": [
        { "label": "設計", "startCol": 0, "span": 1 },
        { "label": "実装", "startCol": 1, "span": 2 },
        { "label": "テスト", "startCol": 2, "span": 1 },
        { "label": "リリース", "startCol": 3, "span": 1 }
      ]
    }
  }
}
```

### 分析図（2×2マトリクス・ファネル・SWOT・ヒートマップ・#207）

意思決定・戦略説明の図式。いずれも `content` レイアウトの下で使い、系列色（`series1`〜`series6`）に色分けを追従させる（単一のアクセント色に意味を持たせすぎない）。ヒートマップの濃淡は単一の系列色 + alpha の階調で作り、`shadeSeries`（`src/components/structureDiagram/colors.ts`）に集約している（4図式で複製しない）。

#### twoByTwo（2×2 マトリクス）

4象限（左上・右上・左下・右下＝Zパターン）を敷き、`items` を正規化座標（`x`・`y` はいずれも 0〜1・左上原点）で散布する。優先度×影響度・工数×効果などの意思決定図に使う。`axes.x.low`/`high`/`label`・`axes.y.low`/`high`/`label` で軸ラベルを添える。項目の色は明示指定または落ちる先の象限インデックスから決定される。範囲外の座標は端に丸められる（破綻ではなく縮退）。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "施策の優先順位",
    "twoByTwo": {
      "quadrants": [
        { "title": "強い / 難しい" },
        { "title": "強い / 簡単" },
        { "title": "弱い / 難しい" },
        { "title": "弱い / 簡単" }
      ],
      "axes": {
        "x": { "label": "実装難易度", "low": "簡単", "high": "難しい" },
        "y": { "label": "効果", "low": "低", "high": "高" }
      },
      "items": [
        { "label": "施策A", "x": 0.15, "y": 0.2 },
        { "label": "施策B", "x": 0.72, "y": 0.28 },
        { "label": "施策C", "x": 0.3, "y": 0.78 },
        { "label": "施策D", "x": 0.82, "y": 0.7 }
      ]
    }
  }
}
```

#### funnel（ファネル）

上から下へ段を積む絞り込み図。`value` の比率で各段の幅を決める（省略時は等幅）。段の色は並び順に `series1`〜`series6` を巡回する。ラベル・値・説明は右側の別領域に置く（段の中に文字を詰め込まない）。`unit` で値の単位を指定できる。推奨上限6段。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "コンバージョンファネル",
    "funnel": {
      "unit": "件",
      "stages": [
        { "label": "アクセス", "value": 10000, "description": "訪問数" },
        { "label": "登録", "value": 3000, "description": "会員登録" },
        { "label": "有料化", "value": 800, "description": "課金" },
        { "label": "継続", "value": 300, "description": "翌月継続" }
      ]
    }
  }
}
```

#### swot（SWOT）

SWOT の慣習に従い S=左上 / W=右上 / O=左下 / T=右下 の4ペインに固定する（S/W が内部要因、O/T が外部要因）。各ペインの `items` は改行区切りで並ぶ。`labels` で各ペインの表題を差し替えられる（省略時は英語表記）。1ペインあたり推奨上限6件。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "SWOT 分析",
    "swot": {
      "labels": { "strengths": "強み", "weaknesses": "弱み", "opportunities": "機会", "threats": "脅威" },
      "strengths": { "items": ["ブランド認知", "熟練エンジニア", "既存顧客基盤"] },
      "weaknesses": { "items": ["レガシーコード", "採用難", "運用コスト高"] },
      "opportunities": { "items": ["市場拡大", "AI活用", "新規セグメント"] },
      "threats": { "items": ["競合強化", "規制強化", "為替変動"] }
    }
  }
}
```

#### heatmap（ヒートマップ）

行×列の値をセルの濃さで表す。セルの塗りは `color` で指定した基準色（既定 `primary`）の alpha 階調で、値の大小は色相ではなく濃さで示す。`min`/`max` を明示しない場合はデータの最小・最大値に写像する。8×8 を超えると値ラベルが既定で省かれる（自動縮退）。単位は `unit`。

```json
{
  "id": "slide-id",
  "layout": "content",
  "content": {
    "title": "四半期別プロダクト成長率",
    "heatmap": {
      "rows": ["Product A", "Product B", "Product C", "Product D"],
      "cols": ["Q1", "Q2", "Q3", "Q4"],
      "color": "series2",
      "unit": "%",
      "values": [
        [12, 18, 24, 30],
        [8, 14, 22, 28],
        [20, 26, 32, 38],
        [4, 10, 16, 22]
      ]
    }
  }
}
```
