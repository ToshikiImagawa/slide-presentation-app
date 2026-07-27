---
id: design-slide-package-open
title: スライドパッケージを開く経路 技術設計書
type: design
status: approved
sdd-phase: plan
impl-status: implemented
created: 2026-07-27
updated: 2026-07-28
depends-on:
  - spec-slide-package-open
tags:
  - slide-package
  - file-association
  - tauri
  - startup
  - single-instance
category: slide-package
---

# スライドパッケージを開く経路

**ドキュメント種別:** 技術設計書 (Design Doc)
**SDDフェーズ:** Plan (計画/設計)
**最終更新日:** 2026-07-28
**関連 Spec:** [slide-package-open_spec.md](./slide-package-open_spec.md)
**関連 PRD:** [slide-package-open.md](../requirement/slide-package-open.md)

---

# 1. 実装ステータス

**ステータス:** 🟢 実装済み（既存3経路・OS ファイル関連付けの全4経路）

本設計書は [Issue #106](https://github.com/ToshikiImagawa/slide-presentation-app/issues/106) にて、**確定済みの設計を先行して文書化**したものである（D-001: 仕様書は実装前に更新されている）。ネイティブ層とフロントエンド層は本書の「4.3. 層間契約」を唯一の真実源として別 Issue で並行実装され、Rust 層は [PR #108](https://github.com/ToshikiImagawa/slide-presentation-app/pull/108)、フロントエンド層は [PR #107](https://github.com/ToshikiImagawa/slide-presentation-app/pull/107) で完了した。

**実装時に設計から変えた点**は、該当する各節に「実装時の変更」として注記してある。設計と実装が食い違って見える場合は、コードを真実として本書を疑うこと。

## 1.1. 実装進捗

| モジュール/機能 | ステータス | 備考 |
|----------|--------|------|
| ファイル選択ダイアログ経路 | 🟢 | FR_001。`pickAndLoadSlidePackage()`（`src/localSlideLoader.ts:383`）。フィルタは `SLIDE_PACKAGE_ARCHIVE_EXTENSIONS`（`src/slidePackageArchive.ts:6`）から生成 |
| HTTPS URL 経路 | 🟢 | FR_002。`loadSlidePackageFromUrl()`（`src/localSlideLoader.ts:399`）＋ Rust `download_slide_package`（`src-tauri/src/lib.rs:216`）。https 以外は `validate_download_url`（`:141`）で拒否。取得・キャッシュ・タイムアウトの設計は [slide-package-distribution_design.md](./slide-package-distribution_design.md) が所有する |
| 最近開いた一覧経路 | 🟢 | FR_003。`openRecentSlidePackage()`（`src/localSlideLoader.ts:418`）。`LazyStore('slide-package-state.json')`（`:18`）の `recentSlidePackages` キー・上限 8 件（`MAX_RECENT_PACKAGES`・`:12`） |
| 共通読み込み手順 | 🟢 | FR_009。`loadSlidePackage()`（`src/localSlideLoader.ts:306`）。`allow_asset_dir` を `readTextFile` より先に呼ぶ順序を保持（`:310`） |
| `fileAssociations` 宣言 | 🟢 | FR_004 / FR_010。`src-tauri/tauri.conf.json:44-56`。`ext: ["spkg"]` と `mimeType` に加え、macOS 向けに `exportedType`（UTI `com.toshikiimagawa.slide-presentation-app.spkg`）を宣言する（6.3 参照） |
| 保留領域と `take_pending_open_paths` | 🟢 | FR_005。`PendingOpenPaths`（`src-tauri/src/lib.rs:88`）＋ 取り出し口（`:115`）。`manage` は `:1085`、`invoke_handler` への登録は `:1107` |
| `open-slide-package` シグナル | 🟢 | FR_006。`dispatch_open_paths()` が pending へ積んだ直後に `app.emit`（`src-tauri/src/lib.rs:133`）。購読は `useOpenSlideRequest`（`src/hooks/useOpenSlideRequest.ts:53`） |
| 多重起動抑止（`tauri-plugin-single-instance`） | 🟢 | FR_007。`src-tauri/Cargo.toml:33`（`2.4.3`）。builder 先頭での初期化は `src-tauri/src/lib.rs:1071`（`#[cfg(desktop)]`・既存プラグイン登録 `:1079-1081` より前） |
| `RunEvent::Opened` の購読 | 🟢 | FR_004。`.build()`（`src-tauri/src/lib.rs:1131`）後の `app.run(\|_app_handle, _event\|)`（`:1134`）内で購読。`#[cfg(target_os = "macos")]` でアームを隔離（`:1137`・決定 #3 参照） |
| Linux MIME 型定義（shared-mime-info XML） | 🟢 | NFR_004。`src-tauri/linux/slide-package-mime.xml`。`bundle.linux.deb.files` / `rpm.files` で `/usr/share/mime/packages/slide-presentation-app.xml` へ同梱（`src-tauri/tauri.conf.json:60-71`） |
| 起動時の pending 引き取り | 🟢 | FR_005。`useOpenSlideRequest(handleOpenRequest)`（`src/main.tsx:234`）。hook 内で `listen` を張った後に pull する（`src/hooks/useOpenSlideRequest.ts:53-61`） |
| 編集モード中の確認ダイアログ | 🟢 | FR_008。外部要求ゲート（`src/main.tsx:224-246` ＋ `src/edit/SlideEditor.tsx:240-250`）。責務の分担は 4.2、判定基準は 7. の NFR_003 が持つ |

## 1.2. 実機動作確認の状況

コード実装とは別に、**OS への関連付け登録はビルド成果物と OS の登録状態に依存する**ため、テストが全緑でも実機で成立しない可能性がある（8. の「CI で検証できない範囲」参照）。

| プラットフォーム | 実機確認 | 備考 |
|:---|:---|:---|
| macOS | ✅ 確認済み | `npm run tauri:build -- --bundles app` で `.app` を生成して Launch Services へ登録し、Finder の「このアプリケーションで開く」から起動することを確認。`npm run tauri:dev` では `.app` が生成されず登録されないため確認できない。検証後は同一 bundle id の重複登録を避けるため `lsregister -u` で登録解除する |
| Windows | ⬜ 未確認 | レジストリ登録はインストーラが行うため、`tauri:build` のインストーラ経由での確認が必要（9.2 参照） |
| Linux | ⬜ 未確認 | `.desktop` の `MimeType=` と同梱 MIME 型定義（`update-mime-database` 登録）の両方が要る。deb / rpm での確認が必要（AppImage は対象外・決定 #4 参照） |

---

# 2. 設計目標

1. **入口の追加でフロントエンドの読み込み経路を分岐させない**: OS 経由の要求も、既存3経路と同じ「パス1本を共通読み込み手順に渡す」形に正規化する。フロントエンドは `.spkg` がどこから来たかを知らない。
2. **二重オープンを実装規律ではなく構造で防ぐ**: 「フラグを立てて二度目を無視する」ではなく、**実データの取り出し口を1つに絞り、取得とクリアを不可分にする**ことで排他を成立させる。フロントエンドがフラグ管理を誤っても二重オープンが起きない形にする。
3. **取りこぼしを構造で防ぐ**: OS の要求はフロントエンドの準備状況と無関係に届く。ネイティブ側に保留領域を置き、フロントエンドが「いつ取りに来ても良い」状態にする。
4. **3 OS の実現手段の差をネイティブ層で吸収する**: 起動引数で届くか専用イベントで届くか、MIME 型の登録が別途必要かといった差を、フロントエンドに漏らさない。
5. **既存機能に触らない**: 既存3経路・発表者ビュー・同梱アドオンの実行時信頼・ビルド時同梱の挙動を変えない（NFR_005）。

---

# 3. 技術スタック

| 領域 | 採用技術 | 選定理由 |
|------|------|------|
| 関連付けの宣言 | `tauri.conf.json` の `bundle.fileAssociations` | 1箇所の宣言から macOS の `Info.plist`（`CFBundleDocumentTypes`）・Windows のレジストリ（インストーラ）・Linux の `.desktop`（`MimeType=`）を **Tauri バンドラが生成**する。OS ごとに別ファイルへ拡張子を書き足す二重管理を避けられる（DC_004 / FR_010） |
| 多重起動抑止 | `tauri-plugin-single-instance` | 2つ目のプロセスの `argv` と `cwd` を既存インスタンスのコールバックへ転送し、2つ目を終了させる。Windows / Linux のホットスタート（起動引数経由）を既存ウィンドウへ集約する唯一の実用手段（FR_007 / DC_002） |
| macOS のファイルオープン通知 | `tauri::RunEvent::Opened` | macOS はコールドスタートでもホットスタートでも `argv` ではなく Apple Event でパスを渡す。これを受けるには `.build()` して `run(\|app, event\|)` でイベントループを購読する必要がある（FR_004 / DC_003） |
| 保留領域 | `Mutex<Vec<String>>` を `tauri::Builder::manage()` で共有状態化 | 既存の `EditMode(Mutex<bool>)`（`src-tauri/src/lib.rs:270`）と同じパターン。追加依存なしで、`take` の取得＋クリアを1つのロック内で不可分に行える（DC_001） |
| Linux の MIME 型定義 | shared-mime-info XML をリソース同梱 | Tauri は `.desktop` に `MimeType=` を書くが、**その MIME 型自体の定義（`glob` パターンと拡張子の対応）は生成しない**。`.spkg` は標準の MIME データベースに存在しない独自拡張子のため、XML を同梱して `update-mime-database` に登録させる必要がある（NFR_004 / DC_004） |
| 到着通知 | `tauri::Emitter::emit`（ペイロードなし） | 既存の発表者ビュー（`presenter-view` イベント）と同じ event API を使うが、**意図的にペイロードを持たせない**。理由は 9.1 の決定 #1 |

---

# 4. アーキテクチャ

## 4.1. システム構成図

3つの到着経路がネイティブ層の**保留領域に集約**され、フロントエンドは取り出し口1つだけを見る。この「多対1への収束」が本設計の中心である。

```mermaid
graph TD
    subgraph OSLayer["OS"]
        Finder["ファイルマネージャ<br/>（ダブルクリック / このアプリで開く）"]
    end

    subgraph Native["ネイティブ層（src-tauri/src/lib.rs）"]
        Single["tauri-plugin-single-instance<br/>（builder 先頭・cfg(desktop)）"]
        Argv["起動引数の解析<br/>std::env::args<br/>cfg(not(macos))"]
        Opened["RunEvent::Opened<br/>cfg(target_os = macos)"]
        Dispatch["dispatch_open_paths()<br/>push してから emit"]
        Pending["PendingOpenPaths<br/>Mutex&lt;Vec&lt;String&gt;&gt;"]
        Take["take_pending_open_paths()<br/>取得＋クリアが不可分"]
        Emit["emit('open-slide-package')<br/>ペイロードなし"]
        Focus["既存ウィンドウの前面化"]
    end

    subgraph Front["フロントエンド"]
        Hook["useOpenSlideRequest<br/>listen → 起動時 pull → 受信ごと pull"]
        Gate["編集モード / dirty 判定<br/>＋確認ダイアログ"]
        Loader["共通読み込み手順<br/>loadSlidePackage()"]
        View["ビュー切替<br/>home / presentation / edit"]
    end

    subgraph Existing["既存3経路（変更なし）"]
        Pick["pickAndLoadSlidePackage()"]
        Url["loadSlidePackageFromUrl()"]
        Recent["openRecentSlidePackage()"]
    end

    Finder -->|"コールドスタート（Win/Linux）"| Argv
    Finder -->|macOS| Opened
    Finder -->|ホットスタート| Single
    Single --> Focus
    Single --> Dispatch
    Argv --> Dispatch
    Opened --> Dispatch
    Dispatch --> Pending
    Dispatch --> Emit
    Pending --> Take
    Take --> Hook
    Emit -.->|シグナルのみ| Hook
    Hook --> Gate
    Gate --> Loader
    Pick --> Loader
    Url --> Loader
    Recent --> Loader
    Loader --> View
```

## 4.2. モジュール分割

| モジュール名 | 責務 | 依存関係 | 配置場所 |
|------|------|------|------|
| `fileAssociations` 宣言 | `.spkg` の関連付けを1箇所で宣言し、3 OS 分の登録情報を生成させる | Tauri バンドラ | `src-tauri/tauri.conf.json`（`bundle`・`:44-56`） |
| `PendingOpenPaths` | OS 由来のパスを、フロントエンドが取り出すまで保持する共有状態 | `std::sync::Mutex`, `tauri::Manager` | `src-tauri/src/lib.rs:88` |
| `take_pending_open_paths` | 保留領域の唯一の取り出し口。取得とクリアを1つのロック内で行う | `PendingOpenPaths` | `src-tauri/src/lib.rs:115` |
| `dispatch_open_paths` | 保留領域への push とシグナル emit を1つにまとめる。3経路すべてがここを通る | `PendingOpenPaths`, `tauri::Emitter` | `src-tauri/src/lib.rs:122` |
| `is_slide_package_path` / `resolve_open_paths_from_argv` | 受付対象の拡張子判定と、`argv` からのパス抽出（`argv[0]` を除外）。純粋ロジックで単体テスト対象 | なし | `src-tauri/src/lib.rs:95` / `:103` |
| 起動引数の収集 | プロセスの `argv` から対象パスを抽出して `dispatch_open_paths` へ渡す。macOS は `RunEvent::Opened` が担うため `#[cfg(not(target_os = "macos"))]` で除外 | `resolve_open_paths_from_argv` | `src-tauri/src/lib.rs:1124-1128`（`setup` 内） |
| `RunEvent::Opened` ハンドラ | macOS のファイルオープン通知を URL からパスへ変換し `dispatch_open_paths` へ渡す | `is_slide_package_path`, `dispatch_open_paths` | `src-tauri/src/lib.rs:1134-1146`（`.build()` 後の `app.run(\|_app_handle, _event\|)`） |
| 多重起動抑止コールバック | 既存ウィンドウを前面化し、2つ目のプロセスの `argv` を `dispatch_open_paths` へ渡す | `tauri-plugin-single-instance`, `resolve_open_paths_from_argv` | `src-tauri/src/lib.rs:1070-1076`（builder 先頭） |
| Linux MIME 型定義 | `.spkg` の MIME 型と glob パターンを OS の MIME データベースへ登録させる | shared-mime-info | `src-tauri/linux/slide-package-mime.xml`（`bundle.linux.deb.files` / `rpm.files` で配置） |
| `useOpenSlideRequest` | `listen` を張ってから起動時 pull を行い、受信ごとに取り出し口を叩く。複数件は最後の1件を採用する | `@tauri-apps/api/core`, `@tauri-apps/api/event` | `src/hooks/useOpenSlideRequest.ts` |
| 外部要求ゲート | 編集モード・未保存状態を見て、確認ダイアログの提示と遷移を決める | `RootContent` の `view` state, `SlideEditor` の `isDirty` | `src/main.tsx:224-246` ＋ `src/edit/SlideEditor.tsx:240-250` |

## 4.3. 層間契約（並行実装の唯一の真実源）

ネイティブ層とフロントエンド層は別 Issue で並行実装するため、境界を次のとおり固定する。**この2つ以外の境界を追加しない。**

```
Rust コマンド:  take_pending_open_paths() -> Result<Vec<String>, String>
                取得と同時にクリアする take セマンティクス。空配列 = 要求なし
Rust イベント:  emit("open-slide-package")
                ペイロードなしのシグナル
```

| 項目 | 決定 |
|:---|:---|
| 取り出し口 | `take_pending_open_paths` のみ。他のコマンド・イベントから実データを取得しない |
| 戻り値の意味 | 空配列は「開く要求なし」。エラーではない |
| 戻り値の型 | `Result<Vec<String>, String>`（`take_pending_open_paths`）※1 |
| クリアのタイミング | 戻り値を作るのと同じロック内。呼び出し側の ack を待たない |
| シグナルのペイロード | なし。フロントエンドはペイロードを一切読まない |
| シグナルの発火条件 | 保留領域へ push した直後。**コールドスタート・ホットスタートの両方で emit する** ※2 |
| 複数パス | `Vec<String>` を返すが、フロントエンドは**最後の1件**のみを開く ※3 |
| 呼び出し回数 | フロントエンドは「起動時に1回」＋「シグナル受信ごとに1回」叩く。空配列が返るのは正常系 |
| 非 Tauri 環境 | `invoke` / `listen` の reject は握りつぶす。`vite --mode screenshot` の素のブラウザでコマンドが存在せず、起動をブロックさせないため |

**※1 実装時の変更**: 設計当初は `Vec<String>` としていたが、`Mutex` の毒化を `unwrap` で panic させず `Err` に落とす形へ変更した。JS 境界では `Ok` が resolve・`Err` が reject になるため、成功時の契約（配列 1 本）は変わらない。

**※2 実装時の変更**: 当初はホットスタート経路のみ emit するとしていたが、経路ごとに分岐させず「push したら必ず通知する」1本の関数（`dispatch_open_paths`）に寄せた。コールドスタートで listen 前に emit が飛んでも、起動時 pull が同じ保留領域を取るため取りこぼさない。

**※3 実装時の変更**: 当初は「先頭1件」としていたが、単一ウィンドウアプリでは「最後に届いた要求＝利用者の最新の意図」を採るのが自然なため変更した（9.2 参照）。

---

# 5. データモデル

```rust
/// OS から届いたパスの保留領域。フロントエンドが take するまで保持する。
/// 既存の EditMode(Mutex<bool>)（src-tauri/src/lib.rs:270）と同じ manage() パターン。
struct PendingOpenPaths(Mutex<Vec<String>>);

/// 唯一の取り出し口。取得とクリアを1つのロック内で不可分に行う（DC_001）。
#[tauri::command]
fn take_pending_open_paths(state: tauri::State<PendingOpenPaths>) -> Result<Vec<String>, String> {
    let mut pending = state.0.lock().map_err(|e| e.to_string())?;
    Ok(std::mem::take(&mut *pending))
}
```

`std::mem::take` により「現在の内容を返す」と「空にする」が同一のロック区間で完了する。ロックを2回取る実装（`clone()` してから `clear()`）にしてはならない。

毒化した `Mutex` を `Err` で返す理由は 4.3 の ※1 が持つ。フロントエンドはこの reject を「要求なし」と同じ扱いで握りつぶすため、取りこぼしはあってもアプリの起動は継続する。

---

# 6. インターフェース定義

## 6.1. ネイティブ層

```rust
// builder の先頭に登録する（DC_002）。ホットスタートの argv を既存インスタンスへ転送する。
let builder = tauri::Builder::default();

#[cfg(desktop)]
let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
    dispatch_open_paths(app, resolve_open_paths_from_argv(&argv));
}));

let app = builder
    .plugin(tauri_plugin_fs::init())
    // ... 既存のプラグイン・manage・invoke_handler はそのまま
    .manage(PendingOpenPaths(Mutex::new(Vec::new())))
    .invoke_handler(tauri::generate_handler![/* ... */ take_pending_open_paths])
    .setup(|app| {
        // ... 既存の log / updater 登録はそのまま
        // Windows / Linux のコールドスタートは argv でパスが渡る。
        // macOS は argv ではなく RunEvent::Opened で届くため除外する
        #[cfg(not(target_os = "macos"))]
        dispatch_open_paths(
            app.handle(),
            resolve_open_paths_from_argv(&std::env::args().collect::<Vec<String>>()),
        );
        Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

app.run(|_app_handle, _event| {
    // RunEvent::Opened は macOS / iOS / Android のみ存在するバリアント（DC_003）。
    // 本アプリの対象はデスクトップ3 OS なので macOS だけを見る（決定 #3）
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Opened { urls } = &_event {
        let paths: Vec<String> = urls
            .iter()
            .filter_map(|url| Some(url.to_file_path().ok()?.to_str()?.to_string()))
            .filter(|path| is_slide_package_path(path))
            .collect();
        dispatch_open_paths(_app_handle, paths);
    }
});
```

保留領域は空で `manage` し、コールドスタートの argv 収集は `setup` 内で行う（`manage` の引数で collect する形にはしなかった）。3経路すべてが `dispatch_open_paths` を通る（発火条件は 4.3 参照）。

## 6.2. フロントエンド層

```typescript
/**
 * 起動時に一度だけ・シグナル受信ごとに呼ぶ。空配列は「要求なし」（正常系）。
 * 複数件は最後の1件を採用する（単一ウィンドウアプリ・9.2 参照）。
 * 非 Tauri 環境では invoke が reject するため握りつぶして undefined を返す。
 */
function takePendingOpenPath(): Promise<string | undefined>

/**
 * listen を張ってから起動時 pull を行い、以降は受信ごとに pull する。
 * 実装は src/hooks/useOpenSlideRequest.ts
 */
function useOpenSlideRequest(onRequest: (path: string) => void): void

/** 外部起因の開く要求の受け口。編集中なら SlideEditor へ委ね、それ以外は即開く（src/main.tsx:224） */
function handleOpenRequest(path: string): void

/** SlideEditor からの回答（確認ダイアログの確定／取消）を受けて遷移を決める（src/main.tsx:237） */
function handleResolveOpen(confirmed: boolean): Promise<void>
```

## 6.3. `tauri.conf.json` の宣言

```jsonc
{
  "bundle": {
    "fileAssociations": [
      {
        "ext": ["spkg"],
        "name": "Slide Package",
        "description": "Slide Presentation Package",
        "mimeType": "application/x-slide-package",
        "role": "Editor",
        "exportedType": {
          "identifier": "com.toshikiimagawa.slide-presentation-app.spkg",
          "conformsTo": ["public.data", "public.archive"]
        }
      }
    ],
    "linux": {
      "deb": { "files": { "/usr/share/mime/packages/slide-presentation-app.xml": "linux/slide-package-mime.xml" } },
      "rpm": { "files": { "/usr/share/mime/packages/slide-presentation-app.xml": "linux/slide-package-mime.xml" } }
    }
  }
}
```

この1箇所から、macOS は `Info.plist` の `CFBundleDocumentTypes`、Windows はインストーラのレジストリ登録、Linux は `.desktop` の `MimeType=` が生成される。**Linux の MIME 型定義 XML は生成されない**ため別途同梱する（9.1 の決定 #4）。

実装時に設計案から変えた点:

- **`role` は `Editor`**（当初案は `Viewer`）。アプリは編集モードで `.spkg` を書き出せるため、閲覧専用の宣言では実態と合わない
- **`exportedType` を追加**。`.spkg` は標準 UTI に存在しないため、macOS では独自 UTI（`com.toshikiimagawa.slide-presentation-app.spkg`）を宣言しないと Finder が型を解決できない。Linux の MIME 型定義 XML（決定 #4）と同じ問題への macOS 側の対処であり、DC_004 の単一真実源は保つ（値は `ext` / `mimeType` の宣言と同じ `fileAssociations` 内に閉じている）
- **`deb` と `rpm` の両方**に MIME XML を同梱する。`bundle.targets` が `"all"` のため deb だけでは rpm 系ディストロで関連付けが効かない。AppImage は `appimage.files` がイメージ内部にしか置かれずホストの MIME データベースへ登録されないため対象外とした

---

# 7. 非機能要件実現方針

| 要件 | 実現方針 |
|------|------|
| NFR_001（取りこぼし防止） | ネイティブ側の保留領域が、フロントエンドの準備状況と無関係にパスを保持する。フロントエンドは `listen` を張った後に取り出し口を叩けば（`src/hooks/useOpenSlideRequest.ts:53-61`）、購読開始前に届いた要求も観測できる |
| NFR_002（二重オープン防止） | 実データの入手経路を取り出し口1つに限り、取得とクリアを同一ロック区間で行う。2つ目の呼び出しは必ず空配列を得るため、二重に開くことが原理的に起こらない |
| NFR_003（編集内容の保護） | 外部起因の遷移を必ずゲート（`src/main.tsx:224`）に通し、編集モードかつ未保存のときは確認ダイアログを挟む（`src/edit/SlideEditor.tsx:240-245`）。既存のエディタ内退出確認（`:253`）と同じ判定基準（`isDirty = text !== source.rawText`・`:234`）を再利用する |
| NFR_004（3 OS 同等性） | 到着経路の差（`argv` / `RunEvent::Opened` / 多重起動抑止コールバック）をすべて `dispatch_open_paths`（`src-tauri/src/lib.rs:122`）経由で保留領域へ収束させる。Linux は MIME 型定義 XML の同梱で登録の欠落を、macOS は `exportedType` の UTI 宣言で型解決を補う |
| NFR_005（リグレッションなし） | 既存3経路の関数・共通読み込み手順に手を入れず、外部要求を「パス1本」に正規化して既存経路へ合流させる。既存プラグイン登録・`invoke_handler`・`setup` の内容は変更しない（追加のみ） |
| DC_005（アドオンロード順序の不変） | 外部要求を `loadSlidePackage()`（`src/localSlideLoader.ts:306`）の入力である「パス1本」へ正規化することで実現する。展開 → `allow_asset_dir` → `<script>` 注入の順序はこの関数の内部に閉じており、入口の追加では触れない |
| NFR_006（条件付きコンパイル） | `RunEvent::Opened` の参照箇所を `#[cfg(target_os = "macos")]` で隔離する（`src-tauri/src/lib.rs:1137`）。他 OS ではバリアント自体が存在しないため、`if let` のアームごと消える形にする（`cfg` の範囲を絞った理由は決定 #3 参照） |

---

# 8. テスト戦略

| テストレベル | 対象 | 実装状況 |
|------|------|------|
| Rust 単体 | 受付拡張子の判定（`.spkg` / `.tgz` / `slides.json` を拾う・大文字小文字を無視する・他拡張子とフラグを捨てる） | 🟢 `is_slide_package_path_*` 3 ケース（`src-tauri/src/lib.rs`） |
| Rust 単体 | 起動引数からのパス抽出（`argv[0]` をスキップ・対象外の引数を捨てる・引数なしで空） | 🟢 `resolve_open_paths_from_argv_*` 2 ケース（`src-tauri/src/lib.rs`） |
| Rust 単体 | `take_pending_open_paths` の take セマンティクス（1回目は内容を返し、2回目は空配列） | 🔴 未実装。`tauri::State` を要求するため純粋ロジックとして切り出せておらず、単体テストから呼べない。take の不可分性は `std::mem::take` 1行に閉じているため、代替として JS 単体（下記）が「同じパスを二度開かない」側から担保する |
| JS 単体 | 起動時 pull・イベント受信ごとの pull・空配列で何もしない・複数件は最後の1件・`listen` 完了までは pull しない・reject の握りつぶし・アンマウント時の unlisten | 🟢 `src/hooks/__tests__/useOpenSlideRequest.test.tsx`（10 ケース。FR_005 / FR_006） |
| JS 単体 | 外部要求ゲート: 未保存でなければ確認なしで即開く／未保存なら確認を挟む／[破棄して開く] で確定／[キャンセル] で拒否／確認中の Esc の二重発火ガード | 🟢 `src/edit/__tests__/SlideEditor.test.tsx`（「外部からのオープン要求」5 ケース。FR_008・NFR_003） |
| 手動（実機） | 3 OS での関連付け登録・コールドスタート・ホットスタート・編集中の要求 | 🟡 プラットフォーム別の実施状況は 1.2 が持つ。**CI では検証できないため実機確認が必須** |

> **CI で検証できない範囲**: OS へのファイル関連付けはインストーラ経由の登録を伴うため、`npm run test:e2e`（Playwright・ブラウザ）でも Rust 単体テストでも検証できない。3 OS の実機でのインストール後確認を受け入れ条件に含める。

> **拡張子の受付範囲**: 設計当初は「`.spkg` のみ拾う・`.tgz` は対象外」としていたが、実装では `.spkg` / `.tgz` / `.json` を受け付ける（`src-tauri/src/lib.rs:96`）。**OS へ関連付けるのは `.spkg` のみ**（決定 #6）であり、ここで広く受けるのは「OS から渡されたパスをアプリが開けるか」の判定であって、関連付けの宣言とは別の関心事である。ファイル選択ダイアログの受付範囲（`.spkg` / `.tgz` / `slides.json`）と揃える方が、`open -a` やコマンドライン引数から渡された場合の挙動が一貫する。

---

# 9. 設計判断

## 9.1. 決定事項

| 決定事項 | 選択肢 | 決定内容 | 理由 |
|------|------|------|------|
| #1 実データの受け渡し方 | (a) イベントの payload にパスを載せる<br>(b) イベントはシグナルにし、`take` を唯一の取り出し口にする<br>(c) フロントエンドから定期ポーリングする | **(b)** | 下記「決定 #1」参照 |
| #2 多重起動抑止の登録位置 | (a) `.setup()` 内で登録（既存 updater と同じ）<br>(b) `builder` の先頭で登録 | **(b)** | 下記「決定 #2」参照 |
| #3 `RunEvent::Opened` の扱い | (a) 全 OS 共通コードとして書く<br>(b) `#[cfg]` で対象 OS に隔離する<br>(c) macOS 専用のモジュールに分離する | **(b)** | 下記「決定 #3」参照 |
| #4 Linux の MIME 登録 | (a) `.desktop` の `MimeType=` だけで足りるとみなす<br>(b) shared-mime-info XML を同梱する | **(b)** | 下記「決定 #4」参照 |
| #5 関連付け宣言の場所 | (a) OS ごとに `Info.plist` / レジストリ / `.desktop` を個別に書く<br>(b) `tauri.conf.json` の `fileAssociations` 1箇所に集約する | **(b)** | 下記「決定 #5」参照 |
| #6 `.tgz` の関連付け | (a) 後方互換として `.tgz` も関連付ける<br>(b) `.spkg` のみ関連付ける | **(b)** | `.tgz` は汎用の tar+gzip 拡張子であり、関連付けるとアーカイバからの関連付けを奪う。開く側の後方互換（既存3経路での読み込み）は維持するため、利用者の不利益はない |

### 決定 #1: イベントをシグナルにし、`take` を唯一の取り出し口にする

**却下した案 (a): イベントの payload にパスを載せる**

一見自然で、既存の発表者ビュー（`presenter-view` イベントは `PresenterViewMessage` を payload で運ぶ）とも揃う。しかし**二重オープンを構造的に防げない**。

アプリの初期化は `src/main.tsx:279` で `Promise.all([loadBuiltinAddons(), loadLocales(), getRecentSlidePackages(), applyTheme()]).then(...)` の完了を待ってから `root.render` する（`:276` で `createRoot` 済み）。つまり **WebView が `listen` を張るまでに、並行ロード4本ぶんの時間がある**。この間に OS の要求が届く可能性は現実的にある（特にコールドスタートでは、要求が届くのはアプリ起動そのものの原因なので必ず先行する）。

したがって「起動時に保留分を pull する」処理はどうしても必要になる。ここで payload にもパスを載せると、実データの入手経路が **「起動時 pull」と「イベント受信」の2本**になる。同じパスが両方から観測され得るため、排他をフロントエンド側のフラグ（処理済みパスの集合など）で持たなければならない。それは実装規律に依存する防御であり、購読解除のタイミング・React の再マウント・複数ウィンドウのいずれかで容易に破れる。

**採用した案 (b)** では、実データの入手経路が `take_pending_open_paths` 1本に潰れる。取得とクリアが同一ロック区間で完了するため、**どちらの経路から叩いても2回目は必ず空配列**になる。排他がフロントエンドの状態管理ではなくネイティブ側で原子的に成立し、フロントエンドは「空だったら何もしない」だけ書けばよい。イベントは「もう一度叩け」という合図に退化する。

**却下した案 (c): 定期ポーリング**

取りこぼしと二重オープンは (b) と同様に防げるが、常時ポーリングのコストを恒常的に払うことになる。到着は稀なイベントであり、シグナルで起こす方が素直である。

### 決定 #2: `tauri-plugin-single-instance` を builder の先頭に登録する

**却下した案 (a): `.setup()` 内で登録**

`src-tauri/src/lib.rs` は `.setup()`（`:1109-1130`）の中で `tauri_plugin_log` と `tauri_plugin_updater` を `app.handle().plugin(...)` で追加している。この作法に揃えたくなるが、**多重起動抑止では間に合わない**。

`.setup()` が走る時点で、そのプロセスはすでに「2つ目のインスタンスとして起動を完了しつつある」段階にいる。多重起動抑止は「自分が2つ目だと気づいたら、引数を1つ目へ転送して**即座に終了する**」ことで成立する仕組みであり、ウィンドウ生成やプラグイン初期化が進んだ後では、余分なウィンドウが一瞬でも見えたり、既存インスタンスとの状態競合（`LazyStore('slide-package-state.json')` への同時書き込みなど）が起きる。

**採用した案 (b)** では `tauri::Builder::default()` の直後（`:1071`）、既存の `tauri_plugin_fs` / `tauri_plugin_dialog` / `tauri_plugin_store`（`:1079-1081`）より前に登録する。updater を `.setup()` で足す既存パターンは「起動後に足しても意味が変わらないプラグイン」だから成立していたのであり、多重起動抑止はその性質を持たない。**登録位置の違いは様式の好みではなく、機能要件そのもの**である。

なお実装では `#[cfg(desktop)]` を付けて `builder` を再束縛する形にした（`:1070-1076`）。`tauri-plugin-single-instance` はモバイルに対応しないため、デスクトップ限定で登録する必要がある。

### 決定 #3: `RunEvent::Opened` を `#[cfg]` で隔離する

`tauri::RunEvent::Opened` は `#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]` でガードされた**バリアント**である。つまり Linux / Windows では「マッチしない」のではなく、**そのバリアント自体が enum に存在しない**。

**却下した案 (a): 全 OS 共通コードとして書く**

`match event { RunEvent::Opened { urls } => ... }` を無条件に書くと、Linux / Windows のビルドが「そのようなバリアントはない」というコンパイルエラーで落ちる。実行時に到達しないだけの話ではないため、`cfg` なしでは3 OS ビルドが成立しない（NFR_006）。

**却下した案 (c): macOS 専用モジュールに分離する**

参照箇所が1つのイベントアームだけなので、ファイル分割はコード量に対して過剰である。分離するなら「パスを保留領域へ push する」共通関数を切り出す方が有効で、そちらは (b) でも行う。

**採用した案 (b)** では、`run(|app, event|)` 内のアームだけを `#[cfg(...)]` で囲む。macOS 以外ではアームごと消え、保留領域と取り出し口（全 OS 共通）はそのまま残る。macOS で `argv` 経路が使われないこととの整合も取れる。

**実装での訂正: `cfg` は `any(macos, ios, android)` ではなく `target_os = "macos"` に絞った**（`src-tauri/src/lib.rs:1137`）。

当初は「バリアントが存在する OS すべて」を条件に書いていたが、PRD の対象は **macOS / Windows / Linux のデスクトップ3 OS** であり、iOS / Android はスコープ外である。バリアントの存在条件をそのまま `cfg` に写すと「モバイルでもファイル関連付けを扱う」という実装意図に読めてしまう。裏返しの `#[cfg(not(target_os = "macos"))]` で `argv` 経路を隔離している箇所（`:1124`）と条件が対になる利点もある。コンパイル可否は `any(...)` でも `macos` 単独でも変わらない（Linux / Windows でアームが消える点は同じ）。

### 決定 #4: Linux は shared-mime-info XML を同梱する

Tauri の `fileAssociations` は、Linux 向けに `.desktop` エントリの `MimeType=` 行を生成する。しかし **MIME 型そのものの定義（拡張子 `.spkg` を `application/x-slide-package` に対応づける glob ルール）は生成しない**。

**却下した案 (a): `.desktop` の `MimeType=` だけで足りるとみなす**

標準的な MIME 型（`text/plain` や `application/pdf`）を関連付ける場合はこれで足りる。拡張子から MIME 型への対応は OS の MIME データベースが既に知っているためである。しかし `.spkg` はプロジェクト固有の独自拡張子であり、**どのディストリビューションの MIME データベースにも存在しない**。定義がなければ、ファイルマネージャは `.spkg` を `application/x-slide-package` と判定できず、`MimeType=` の宣言が誰とも結びつかない。結果として「ダブルクリックしても何も起こらない」または「別のアプリが tar+gzip として開く」ことになる。

**採用した案 (b)** では、shared-mime-info 形式の XML（`.spkg` の glob と MIME 型を宣言）をパッケージに同梱し、インストール時に `update-mime-database` へ登録させる。これは `.desktop` の生成を置き換えるものではなく、**その前提を用意する補完**である。DC_004（宣言の単一真実源）とは矛盾しない: 拡張子と MIME 型の値は `fileAssociations` の宣言と一致させ、XML はその値を Linux の要求する形式で表現するだけである。

### 決定 #5: `tauri.conf.json` の `fileAssociations` 1箇所に集約する

**却下した案 (a): OS ごとに個別に書く**

macOS の `Info.plist`（`CFBundleDocumentTypes`）・Windows インストーラのレジストリ登録スクリプト・Linux の `.desktop` を、それぞれ手書きで管理する案。拡張子を1つ増やすたびに3箇所を同期させる必要があり、片方だけ更新した状態が容易に発生する。3 OS の同等性（NFR_004）を人間の注意力で担保する形になる。

**採用した案 (b)** では、`bundle.fileAssociations` の1宣言から3 OS 分の登録情報がバンドラによって生成される。拡張子や MIME 型の値が食い違う余地がなく、DC_004 の「単一の真実源」がビルドプロセスによって強制される。生成物で覆えない Linux の MIME 型定義のみを追加リソースで補い、その値は宣言と一致させる（決定 #4）。

## 9.2. 未解決の課題

| 課題 | 影響度 | 対応方針 |
|------|------|------|
| 関連付けで複数ファイルを選択した場合の扱い | 低 | 契約上は `Vec<String>` を返すが、フロントエンドは**最後の1件**のみを開き、残りは破棄する（`src/hooks/useOpenSlideRequest.ts:18`）。設計当初は「先頭1件」としていたが、単一ウィンドウアプリでは「最後に届いた要求＝利用者の最新の意図」を採るのが自然なため実装時に変更した。複数ウィンドウでの並行表示は PRD のスコープ外。将来「最近開いた一覧へ全件登録する」等の拡張余地を残すため、戻り値の型は `Vec` を維持する |
| 編集モードだが未保存でない場合の確認ダイアログ | 低 | 失うものがないため確認せず遷移する（`src/edit/SlideEditor.tsx:242-243`。7. の NFR_003 の判定基準に従う）。実機検証で違和感があれば「常に確認する」へ変更する |
| macOS で `argv` にもパスが渡る場合の重複 | 低 | `argv` 経路は `#[cfg(not(target_os = "macos"))]` で macOS から除外したため（`src-tauri/src/lib.rs:1124`）、macOS で両経路が同じパスを push することはない。加えてフロントエンドは最後の1件のみを開くため、仮に重複しても二重オープンにはならない。ネイティブ側での重複除去は実装しないと判断した |
| Windows インストーラ以外（ポータブル実行）での関連付け | 低 | レジストリ登録はインストーラが行うため、インストーラを経由しない配布形態では関連付けが成立しない。既存の配布方式（`npm run tauri:build` のバンドル）を前提とし、対応しない |
| `.spkg` の MIME 型名 | 低 | `application/x-slide-package` を暫定とする。IANA 登録は行わないため `x-` プレフィックスを維持する |
