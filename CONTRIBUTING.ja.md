# Contributing

[English](CONTRIBUTING.md) | **日本語**

このリポジトリでソースからアプリをビルドしたり、カスタムコンポーネント（アドオン）を実装したり、CLI でスライド
パッケージを書き出すための手引きです。アプリの使い方は [README.ja.md](README.ja.md) を参照してください。

## セットアップ

```bash
npm install
```

アプリの実行には Tauri のための Rust ツールチェーン（`cargo`/`rustc`）が必要です。未導入の場合は
[Tauri の前提条件ガイド](https://v2.tauri.app/start/prerequisites/) を参照してください。

## コマンド

| コマンド                        | 説明                                                                          |
|--------------------------------|-------------------------------------------------------------------------------|
| `npm run tauri:dev`            | デスクトップアプリ起動（Tauri + アドオンビルド + Vite HMR）                    |
| `npm run tauri:build`          | デスクトップアプリのバンドルをビルド                                          |
| `npm run dev`                  | フロントエンドのみ開発サーバー起動（アドオンビルド + Vite HMR）               |
| `npm run build`                | フロントエンドのみプロダクションビルド（アドオンビルド + `dist/` に出力）      |
| `npm run build:addons`         | アドオンのみビルド                                                            |
| `npm run preview`              | ビルド済みファイルのプレビュー                                                |
| `npm run format`               | Prettier でコード整形（`src/**/*.{ts,tsx,css}`）                              |
| `npm run typecheck`            | TypeScript 型チェック                                                         |
| `npm run export:slides`        | スライド内容を配布用パッケージ（.spkg）としてエクスポート                      |
| `npm run generate-icons`       | `resources/icon.svg` から `src-tauri/icons/` を再生成（macOS 専用）           |
| `npm run generate-docs`        | `README.md` / `CHANGELOG.md` を PDF 化（`docs/` に出力）                      |

## アドオンの追加

カスタムコンポーネントをアドオンとして追加し、スライド内で使用します。

### 1. アドオンディレクトリを作成する

```
addons/src/{addon-name}/
├── entry.ts         # コンポーネントの登録
└── MyComponent.tsx  # コンポーネントの実装
```

### 2. コンポーネントを実装する

```tsx
// addons/src/my-addon/MyComponent.tsx
const React = window.React;

export function MyComponent({ message }: { message: string }) {
  return React.createElement('div', null, message);
}
```

### 3. エントリファイルでコンポーネントを登録する

```ts
// addons/src/my-addon/entry.ts
import { MyComponent } from './MyComponent';

window.__ADDON_REGISTER__('my-addon', [
  { name: 'MyComponent', component: MyComponent },
]);
```

### 4. ビルドする

```bash
npm run build:addons
```

### 5. スライドで使用する

```json
{
  "id": "custom-slide",
  "layout": "custom",
  "content": {
    "component": {
      "name": "MyComponent",
      "props": {
        "message": "Hello!"
      }
    }
  }
}
```

### 未解決のコンポーネント参照

スライドマスターの `component` 装飾（`theme.masters.*.decorations`）が `ComponentRegistry` に未登録の名前を参照している場合（アドオン未インストール・trust プロンプトでの拒否・綴りミス等）、その装飾は「Component not found」の破線枠にフォールバックせず、静かにスキップされます。フォールバックしてしまうと、そのマスターを使うすべてのスライドに破線枠が並んでしまうためです。代わりに通常ロード時のトースト（`getMasterWarnings`/`getThemeWarnings` 経由）で一度だけ警告を出し、デッキは素のテーマのまま開けるようにします。これにより、説明のない壊れたデッキではなく、対処可能な単一の通知をユーザーに提供します。

## 意匠トークン

スライドのコンポーネントは、角丸・境界線幅・装飾線の太さ・アクセント幅・影の不透明度・表のゼブラ濃度をハードコードしてはいけません。代わりに下記の CSS 変数を参照してください。これらは `src/styles/global.css` で宣言され、デッキごとに `theme.tokens` から上書きできます。ハードコードするとブランドテーマに追従できず、色だけ合わせても「自社のものに見えない」原因になります。

| トークン                       | 既定値  | 制御する対象                                                                     |
|--------------------------------|---------|----------------------------------------------------------------------------------|
| `--theme-radius-sm`            | `8px`   | パネルと小さな chrome（`CodeBlockPanel`・インライン `code`・Reveal のスライド番号） |
| `--theme-radius-md`            | `12px`  | 中間サイズの面とカード内側のネスト要素（`QrCodeCard`・タイルのアイコンチップ）      |
| `--theme-radius-lg`            | `16px`  | カード（`MuiCard` = `FeatureTileGrid` のタイル）                                  |
| `--theme-border-width`         | `1px`   | カード・パネルのヘアライン境界線（装飾的な太線は下記の専用トークンで制御します）    |
| `--theme-heading-accent-width` | `6px`   | スライド見出し（`.slide-title`）左端のアクセントバーの太さ                        |
| `--theme-frame-rule-width`     | `4px`   | スライド上端に走るブランド帯の太さ（`.slide-container::before`）                  |
| `--theme-rule-width`           | `4px`   | 本文中の装飾的な区切り線の太さ（`Timeline` を貫く水平線）                         |
| `--theme-node-ring-width`      | `3px`   | 番号バッジ（`TimelineNode`）を囲むリングの太さ                                    |
| `--theme-card-accent-width`    | `0px`   | カード内側（左端）のアクセントバー幅。`0` は「バーなし」＝現行の見た目             |
| `--theme-shadow-strength`      | `1`     | 影の不透明度に掛ける倍率。`0` で影なし、`2` で倍の濃さ                            |
| `--theme-zebra-opacity`        | `0.04`  | 表の偶数行に敷く背景の alpha 値                                                   |

装飾線の 4 トークンを別軸に分けているのは、企業テンプレートがそれぞれ独立に太さを変えるためです。見出しの縦アクセントはタイポグラフィの一部、上端の帯はスライドフレームの意匠、本文の区切り線はコンテンツ階層の仕切りであり、バッジを囲むリングは横断線と同じ太さにすると内側の面積が減って数字が読めなくなります。**ヘアライン用の `--theme-border-width` にこれらを押し込まないでください**（そちらは 1px の細線の軸です）。

参照の規則:

- 角丸・境界線幅・装飾線の太さはプロパティへ直接指定します: `border-radius: var(--theme-radius-md)` / `border: var(--theme-border-width) solid var(--theme-border)` / `height: var(--theme-rule-width)`
- 影の強さは倍率なので、コンポーネント固有の alpha を残したまま掛けます: `box-shadow: 0 2px 8px rgba(0, 0, 0, calc(0.04 * var(--theme-shadow-strength)))`。各影の相対的な深さを保ったまま、テーマ側の1つのつまみで全体を強弱できます
- `--theme-card-accent-width` の既定値は `0` なので、バーは `border-left` ではなく擬似要素で描きます（`0px` の border はその辺のヘアライン境界線を食い潰してしまいます）
- スライド上端の帯は `global.css` に 2 箇所あります（`.slides .slide-container::before` と、Reveal.js 自身のスタイルに勝つための詳細度の高い `.reveal .slides section.slide-container::before`）。**両方が `--theme-frame-rule-width` を参照していないと詳細度の高いほうが勝ってトークンが効きません**
- 意図的にテーマ非依存の見た目を持つコンポーネント（ターミナル色をハードコードしている `TerminalAnimation`）と、フォールバック・エラー表示 UI（`FallbackImage`・未解決コンポーネントのプレースホルダ）は、意図的にこの仕組みの対象外です

デッキの `theme.tokens` からの上書き: キーは `--` を除いた CSS 変数名、スコープキーは `masterKey`（`section[data-master="<key>"]` として出力）または `"*"`（デッキ全体。`:root` として出力）です。両方に同じ変数があれば `masterKey` スコープが勝ちます。

```json
{
  "theme": {
    "tokens": {
      "*": { "theme-radius-lg": "4px", "theme-border-width": "2px", "theme-heading-accent-width": "10px", "theme-card-accent-width": "6px" },
      "standard": { "theme-shadow-strength": "0" }
    }
  }
}
```

## 静的アセット

`public/` ディレクトリに配置したファイルは、ビルド後にルートパスからアクセスできます。

| ファイル                              | URL                             |
|---------------------------------------|---------------------------------|
| `public/slides.json`                  | `/slides.json`                  |
| `public/theme-colors.json`            | `/theme-colors.json`            |
| `public/images/logo.png`              | `/images/logo.png`              |
| `public/voice/slide-01.wav`           | `/voice/slide-01.wav`           |
| `public/assets/locales/manifest.json` | `/assets/locales/manifest.json` |
| `public/assets/locales/en-US.json`    | `/assets/locales/en-US.json`    |

## スライドパッケージの書き出しと同梱

アプリの編集モードからも `.spkg` を書き出せます（[README.ja.md の編集モード](README.ja.md#編集モード)）。
ここでは CLI での書き出しと、ビルド時にスライドを同梱する方法を説明します。

### エクスポート（パッケージ作成）

```bash
npm run export:slides -- --name my-presentation --slides slides.json
```

| オプション  | 必須 | 説明                                                    |
|-------------|:----:|---------------------------------------------------------|
| `--name`    | はい | パッケージ名（`@slides/{name}` として生成）             |
| `--slides`  | はい | source ディレクトリ配下のスライド JSON ファイル名       |
| `--source`  |      | スライド JSON と参照アセットの基準ディレクトリ（既定: `public`） |
| `--version` |      | バージョン（既定: `1.0.0`）                             |
| `--addons`  |      | ビルド済みアドオン（`addons/dist`）をパッケージに同梱   |
| `--strict`  |      | 参照アセットが1つでも欠けていたら失敗させる（配布物のビルド用。既定は警告のみ） |

これにより `dist-slides/` に `.spkg` ファイルが生成されます（`.tgz` と同じ tar+gzip 形式で、`npm pack` の出力を独自拡張子へ
リネームしたものです）。slides.json で参照されるアセットパス（`image/`・`voice/`・`theme/`・`font/`）は自動検出され
パッケージに含まれます。`--addons` を指定すると、ビルド済みアドオンが `addons/` 配下に同梱され、パッケージを開いた後に
動的に読み込まれます（Tauri ランタイムのみ。下記参照）。

### インポート（パッケージの使用）

`VITE_SLIDE_PACKAGE` 環境変数でスライドパッケージを指定します。

#### ローカルパスで使用する（npm install 不要）

`.env.local` に `.spkg` ファイル（または旧 `.tgz`）または展開済みディレクトリのパスを指定します。

```bash
# .spkg を直接指定
VITE_SLIDE_PACKAGE=./dist-slides/slides-my-presentation-1.0.0.spkg

# 展開済みディレクトリを指定
VITE_SLIDE_PACKAGE=./dist-slides/my-presentation
```

#### インストール済みの npm パッケージとして使用する

すでに npm の依存パッケージとして利用可能な場合（例: レジストリに公開し `npm install @slides/my-presentation` で
インストール済み）は、パッケージ名を直接指定します。

```bash
VITE_SLIDE_PACKAGE=@slides/my-presentation
```

> **注意:** `npm run export:slides` の出力は `.spkg` ファイルです。npm は `.tgz`/`.tar.gz`/`.tar` と異なりこの拡張子を
> インストール可能なローカル tarball として認識しないため、`npm install ./dist-slides/xxx.spkg` は動作しません。
> エクスポート直後のパッケージを使う場合は、上記のローカルパス指定を使ってください。

#### `VITE_SLIDE_PACKAGE` の値リファレンス

| 値                             | 挙動                                                        |
|--------------------------------|--------------------------------------------------------------|
| `./dist-slides/xxx-1.0.0.spkg` | `.spkg`（または旧 `.tgz`）を自動展開してローカルで使用（npm install 不要） |
| `./dist-slides/xxx/`           | 展開済みディレクトリから直接読み込み（npm install 不要）      |
| `@slides/xxx`                  | インストール済みの npm パッケージから読み込み                 |
| (未指定)                       | `@slides/*` パッケージを自動検出                              |

### 挙動

- `public/` に同名ファイルが存在する場合は `public/` のファイルが優先される（パッケージはフォールバック）
- `npm run build` 時、パッケージのアセットは `dist/` にコピーされる（既存ファイルは上書きしない）

## ブランドテーマ単体の配布

`meta.brandTheme`（外部 `ThemeData` JSON への参照。[意匠トークン](#意匠トークン)・`applyThemeData` 参照）を使うと、
色だけのシンプルなテーマから、フォント・masters・トークン・ロゴまで含むフルセットのテーマまで、複数デッキへ
組織単位で同じブランドテーマを適用できます。本節では、そのテーマをスライドデッキから独立して単体配布する方法
を説明します（#210）。

### 配布形式

ブランドテーマ単体の配布物は、**`ThemeData` の JSON ファイルと、それが参照するアセットファイル**（`image/`・
`font/`・`theme/` 接頭辞。スライドパッケージと同じ規則）であり、`.spkg` アーカイブではありません。
`fetchThemeData`（`src/applyTheme.ts`）はこの JSON を `fetch()` で直接取得するため、展開ステップを設計する必要
がありません。組織側は `theme.json` とそのアセットのサブディレクトリを安定した URL でホストし、
`meta.brandTheme` にその `theme.json` を指定します。

`meta.brandTheme` が `https://` URL の場合、`fetchThemeData` は取得したテーマ内の `image/`・`font/`・`theme/`
接頭辞を持つアセット参照を、**テーマ自身の取得元 URL を基準にした絶対URL**へ書き換えます（ローカル `.spkg`
のアセットを `baseDir` 基準で解決する `resolveLocalAssetPaths` と対称の規則）。これをしないと、
`font/corp.woff2` のような相対パスがテーマの配布元ではなくアプリ自身のオリジン基準で解決されてしまい 404
になります。ローカル・相対パスの `meta.brandTheme` 参照（デッキに同梱されたテーマ）はこの書き換えの対象外
です。すでに document の base URI 基準で正しく解決されるためです。

### エクスポート（配布可能なテーマの作成）

```bash
npm run export:theme -- --name acme-brand --theme theme/acme-brand.json
```

| オプション    | 必須 | 説明                                                                                |
|---------------|:----:|-------------------------------------------------------------------------------------|
| `--name`      | はい | `dist-themes/` 配下の出力ディレクトリ名                                             |
| `--theme`     | はい | source ディレクトリ配下のテーマ JSON ファイル名                                     |
| `--source`    |      | テーマ JSON と参照アセットの基準ディレクトリ（既定: `public`）                       |
| `--base-url`  |      | アセット参照に絶対URLとして焼き込む配布先の公開URL基準（下記参照）                   |
| `--strict`    |      | 参照アセットが1つでも欠けていたら失敗させる（配布物のビルド用。既定は警告のみ）       |

`dist-themes/{name}/theme.json` と、参照されるアセットファイルが `--source` と同じディレクトリ構造で書き出され
ます。`redistribution: 'prohibited'`（#171）を指定したフォントソースはコピー対象から除外されます。
`export-slides.mjs` が `.spkg` から除外する際の規則（`extractAssetPaths` / `extractProhibitedFontPaths`）を
そのまま再利用しているため、規則は単一真実源です。

`--base-url`（例: 特定タグの GitHub Releases ダウンロード URL）を指定すると、書き出す `theme.json` にアセット
参照の絶対URLを直接焼き込みます。これがバージョン付きテーマを公開する際の推奨方法です。`theme.json` とその
アセットファイルを同じリリースに個別に添付し、そのリリースの `--base-url` を指定してバージョンごとに一度
エクスポートを実行し、`meta.brandTheme` に出力された `theme.json` の URL を指定します。`--base-url` を指定
しない場合、アセット参照は相対パスのまま残るため、出力ディレクトリをそのまま（`image/`・`font/` 等のサブ
ディレクトリ構造を保って）ホストする運用でのみ機能します（上記の `fetchThemeData` の絶対URL解決でも動作します
が、エクスポート時に URL を焼き込む方が挙動を把握しやすくなります）。

### バージョニング・キャッシュ・オフライン再適用

配布物自体にバージョンフィールドは持たせません。バージョニングは `meta.brandTheme` がどの URL を指すか
（バージョンタグ付きのリリース か、常に最新を指す "latest" か）で表現します。`src/sampleSlides.ts` の
`resolveSamplePackageName` がバージョン付き取得と `latest` 取得を区別しているのと同じ考え方です。

`fetchThemeData` は常にネットワーク取得を先に試み、その後フォールバックします。

- 取得に成功した場合、解決済みの `ThemeData` を `meta.brandTheme` の URL をキーに Cache Storage API
  （`caches`）へ保存します。
- 取得に失敗した場合（オフライン・404 等）、同じキーでキャッシュを読み、直前に成功した取得結果を返します。
  これにより、以前ブランドテーマを適用したデッキをオフラインで再度開いても見た目が保たれます。
- キャッシュも無い場合（初回取得・Cache Storage 未対応環境）は `undefined` を返し、デッキは自身の
  `theme`/`theme-colors.json` のカスケードにフォールバックします。ブランドテーマは装飾であるため、取得失敗が
  デッキを開けなくすることはありません（`applyPresentationTheme` のカスケード参照）。

### 挙動

- `resolveBrandTheme`（`src/localSlideLoader.ts`。ローカル `.spkg` を開く際に使われる）は、デッキ自体の取得元に
  関わらず `meta.brandTheme` を同じ規則で解決します。相対パスならパッケージの `baseDir` 基準で完全にオフライン
  解決され、`https://` URL なら上記の `fetchThemeData` に委譲されます。つまりローカル `.spkg` デッキが
  `meta.brandTheme` にリモート URL を指定している場合、ブラウザ・同梱経路と同じく、オフライン再適用が効くまでに
  一度は取得の成功が必要です。
- エクスポート時の `--strict` は「参照アセットが欠けたテーマを、ロゴやフォントが欠けたまま黙って配布物にしない」
  という受け入れ基準に対応します。配布物を作る際は指定し、ローカルでの試行時は外してください。

## リリース手順

1. バージョンを上げます。`prepare-release` skill を使うか、`package.json`・`src-tauri/Cargo.toml`・
   `src-tauri/Cargo.lock`・`src-tauri/tauri.conf.json` と `README.md` / `README.ja.md` のバージョンバッジを手で更新し、
   リリースノートを `CHANGELOG.md` / `CHANGELOG.ja.md` に追記します。
2. その変更で PR を出し、CI が通ったら `main` にマージします。
3. 新しいバージョンに対応するタグを push します。

   ```bash
   git tag v<バージョン>
   git push origin v<バージョン>
   ```

4. タグの push で [`.github/workflows/release.yml`](.github/workflows/release.yml) が起動し、次を行います。
   - macOS・Windows・Linux の署名済みインストーラをビルドする
   - それらを添付した **ドラフト** の GitHub Release を作成する
   - アップデータ用マニフェスト（`latest.json`）を生成して添付する
   - マニフェストの工程が成功したらドラフトを自動で解除（公開）する。このワークフローに手動の承認ゲートはありません。
     公開前にドラフトを確認したい場合は、タグ push 後・ワークフロー完了前の間に
     [Releases ページ](https://github.com/ToshikiImagawa/slide-presentation-app/releases) を確認してください。

### タグの命名

- 安定版リリース: `v<major>.<minor>.<patch>`（例: `v1.2.0`）
- プレリリース: `-alpha`・`-beta`・`-rc` を付ける（例: `v1.2.0-beta`、`v1.2.0-rc.1`）。`release.yml` がこの接尾辞を検出し、
  GitHub Release を自動でプレリリース扱いにします

### 必要なシークレット

リリースワークフローは複数の GitHub Actions シークレット（コード署名証明書、アップデータ署名鍵など）に依存します。
全一覧・各シークレットの取得方法・登録場所・未設定時のフォールバック挙動は
[docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md) を参照してください。

## ライセンス

MIT
