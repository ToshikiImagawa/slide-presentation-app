use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

mod bin_resolve;
mod generation;
mod vertex_config;

/// スライドパッケージの書き出し拡張子（issue #41: 独自拡張子への変更）。展開側は拡張子に依存しないため
/// この定数は書き出し（build_slide_package_gated）とそのテストでのみ参照する。
const SLIDE_PACKAGE_EXTENSION: &str = "spkg";

/// ユーザーがダイアログで選んだディレクトリを asset プロトコル・fs プラグイン双方の
/// 読み取り許可スコープに追加する（fs プラグインの scope は asset プロトコルの scope とは別物で、
/// readTextFile 等はこちらが許可されていないと forbidden path エラーになる）
#[tauri::command]
fn allow_asset_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
  app
    .asset_protocol_scope()
    .allow_directory(&dir, true)
    .map_err(|e| e.to_string())?;
  app
    .fs_scope()
    .allow_directory(&dir, true)
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// tar+gzip バイト列（.spkg・旧 .tgz とも同一形式）を extract_dir に展開し、slides.json のあるディレクトリを返す
/// （`npm pack` は内容を package/ 配下にネストするため、scripts/export-slides.mjs 由来の
/// パッケージと同じ規則で package/ を優先的に探す）
fn extract_slide_archive(bytes: &[u8], extract_dir: &Path) -> Result<PathBuf, String> {
  if extract_dir.exists() {
    fs::remove_dir_all(extract_dir).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(extract_dir).map_err(|e| e.to_string())?;

  let gz = flate2::read::GzDecoder::new(Cursor::new(bytes));
  tar::Archive::new(gz)
    .unpack(extract_dir)
    .map_err(|e| e.to_string())?;

  let package_dir = extract_dir.join("package");
  Ok(if package_dir.is_dir() {
    package_dir
  } else {
    extract_dir.to_path_buf()
  })
}

/// スライドパッケージ (.spkg・旧 .tgz) をアプリのキャッシュディレクトリに展開し、slides.json のあるディレクトリを返す
#[tauri::command]
fn extract_slide_package(app: tauri::AppHandle, package_path: String) -> Result<String, String> {
  let bytes = fs::read(&package_path).map_err(|e| e.to_string())?;

  let stem = Path::new(&package_path)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("package");
  let extract_dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| e.to_string())?
    .join("slide-packages")
    .join(stem);

  let result_dir = extract_slide_archive(&bytes, &extract_dir)?;
  result_dir
    .to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "抽出先パスの文字列化に失敗しました".to_string())
}

/// ダウンロード元 URL を検証する（純粋ロジック・テスト対象）。https 以外のスキームは拒否する
/// （issue #40: 任意 URL を許可する以上、tauri-plugin-http のような事前許可ドメイン方式は本要件と相性が悪いため
/// 採用せず、既存の reqwest 経由で Rust 境界に集約する。スキームのみ最小限の制約として課す）
fn validate_download_url(raw: &str) -> Result<reqwest::Url, String> {
  let parsed = reqwest::Url::parse(raw).map_err(|_| "URLの形式が正しくありません".to_string())?;
  if parsed.scheme() != "https" {
    return Err("https の URL のみ指定できます".to_string());
  }
  Ok(parsed)
}

/// スライドパッケージのダウンロード用共有 reqwest クライアント（generation::vertex の shared_client と同パターン）。
/// タイムアウトはパッケージのファイルサイズを考慮し生成系の応答タイムアウトより長めに取る。
static DOWNLOAD_HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
const DOWNLOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

fn download_http_client() -> reqwest::Client {
  DOWNLOAD_HTTP_CLIENT
    .get_or_init(|| {
      reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
    })
    .clone()
}

/// URL からキャッシュ展開先ディレクトリ名を導出する（純粋ロジック・テスト対象）。
/// extract_slide_package がローカルパスの file_stem を展開先名に使うのと同様、
/// 同一 URL は同じ展開先を再利用・上書きする
fn url_cache_stem(url: &str) -> String {
  use std::collections::hash_map::DefaultHasher;
  use std::hash::{Hash, Hasher};
  let mut hasher = DefaultHasher::new();
  url.hash(&mut hasher);
  format!("url-{:x}", hasher.finish())
}

/// URL からスライドパッケージ（.spkg・旧 .tgz と同一 tar+gzip 形式）をダウンロードし、
/// アプリのキャッシュディレクトリに展開して slides.json のあるディレクトリを返す（issue #40）。
/// https の URL のみ許可する
#[tauri::command]
async fn download_slide_package(app: tauri::AppHandle, url: String) -> Result<String, String> {
  let parsed = validate_download_url(&url)?;

  let response = download_http_client()
    .get(parsed)
    .send()
    .await
    .map_err(|e| format!("ダウンロードに失敗しました: {e}"))?;
  if !response.status().is_success() {
    return Err(format!(
      "ダウンロードに失敗しました（HTTP {}）",
      response.status()
    ));
  }
  let bytes = response
    .bytes()
    .await
    .map_err(|e| format!("ダウンロードに失敗しました: {e}"))?;

  let extract_dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| e.to_string())?
    .join("slide-packages")
    .join(url_cache_stem(&url));

  let result_dir = extract_slide_archive(&bytes, &extract_dir)?;
  result_dir
    .to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "抽出先パスの文字列化に失敗しました".to_string())
}

/// 編集モードの書き込み許可フラグ（発表本番での誤書き込みを構造的に防ぐゲート）。
/// save_slides_json / export_slide_package はこの state が true のときのみ書き込む（NFR-003: 最小権限）
struct EditMode(Mutex<bool>);

/// 編集モード state を切り替える（View/Edit の遷移に同期して JS から呼ばれる）
#[tauri::command]
fn set_edit_mode(enabled: bool, state: tauri::State<EditMode>) -> Result<(), String> {
  *state.0.lock().map_err(|e| e.to_string())? = enabled;
  Ok(())
}

/// 生成有効フラグ（生成・ネットワーク・キー操作のゲート。既定 false）。
/// EditMode と併せて多重ゲートし、network / キーチェーンへ到達する前に検査する（DC-003 / NFR-003）
struct GenerationEnabled(Mutex<bool>);

/// 実行中の生成の中断トークン置き場（`Some` = 生成中／`None` = idle）。
/// 同時実行 1 件の判定（`is_some()`）と in-flight への中断伝達を 1 つの state で担う（FR-010）。
struct ActiveGeneration(Mutex<Option<generation::CancelToken>>);

/// 生成種別の dev override 用環境変数（設定/UI 選択より優先。テスト・特殊環境向け）。
const GENERATOR_ENV: &str = "SLIDE_APP_GENERATOR";

/// 生成有効フラグ設定の純粋ゲートロジック（テストはこの関数を直接叩く）。
/// 生成の有効化は編集モード時のみ許可し、無効化は編集モードに関わらず常に許可する
/// （生成は編集モードの一入力手段であり、編集モード外では有効化させない・DC-003）
fn resolve_generation_enabled(edit_mode: bool, requested: bool) -> Result<bool, String> {
  if requested && !edit_mode {
    return Err("編集モードが無効です".to_string());
  }
  Ok(requested)
}

/// 生成/中断コマンドのゲート判定（編集モード かつ 生成有効のときのみ true）。純関数・テスト対象（FR-009）。
fn generation_command_allowed(edit_mode: bool, generation_enabled: bool) -> bool {
  edit_mode && generation_enabled
}

/// 編集モードゲート（無効なら Err）。キー操作コマンドの共通前段（文言を一元化）。
fn require_edit_mode(edit_mode: &tauri::State<EditMode>) -> Result<(), String> {
  if *edit_mode.0.lock().map_err(|e| e.to_string())? {
    Ok(())
  } else {
    Err("編集モードが無効です".to_string())
  }
}

/// 生成有効フラグを切り替える（編集モード必須。生成パネルの有効化/無効化に同期して JS から呼ばれる）
#[tauri::command]
fn set_generation_enabled(
  enabled: bool,
  edit_mode: tauri::State<EditMode>,
  generation: tauri::State<GenerationEnabled>,
) -> Result<(), String> {
  let edit = *edit_mode.0.lock().map_err(|e| e.to_string())?;
  let next = resolve_generation_enabled(edit, enabled)?;
  *generation.0.lock().map_err(|e| e.to_string())? = next;
  Ok(())
}

/// 生成の実処理（Vertex 設定ロード＋生成器解決＋候補 1 件生成）。ゲート/同時実行/cancel の管理は generate_slides 側。
/// 内蔵は Vertex 設定をロードし、GCP トークンは生成器が実行時に ADC から取得する（NFR-003）。
async fn run_generation(
  request: &generation::GenerateRequest,
  app: &tauri::AppHandle,
  cancel: &generation::CancelToken,
) -> Result<String, generation::GenerateError> {
  // 生成種別: dev override（env・untyped）→ UI/設定の型付き選択（request.kind）を fallback に解決する
  let env_override = std::env::var(GENERATOR_ENV).ok();
  let kind = generation::resolve_generator_kind(env_override.as_deref(), request.kind);

  // 内蔵は Vertex 設定（project/region/model）を渡す。未設定なら factory が NotConfigured を返し事前ゲートへ戻す。
  // 外部は設定不要（factory 側で無視）
  let vertex_config = vertex_config::get_vertex_config(app).ok().flatten();
  let generator = generation::create_generator(kind, vertex_config)?;
  generator.generate(request, cancel).await
}

/// 生成器で候補 1 件を生成する（検証/自動修正ループは JS 側 aiGenerate が駆動・design §9.1）。
/// 冒頭で「編集モード かつ 生成有効」を検査し、同時実行を 1 件に制限してから keyring/network へ到達する
/// （DC-002/DC-003/NFR-003/FR-009/FR-010）。
#[tauri::command]
async fn generate_slides(
  request: generation::GenerateRequest,
  app: tauri::AppHandle,
  edit_mode: tauri::State<'_, EditMode>,
  generation: tauri::State<'_, GenerationEnabled>,
  active: tauri::State<'_, ActiveGeneration>,
) -> Result<String, String> {
  // ゲート: 編集モード かつ 生成有効（どちらか欠けたら keyring/network に到達しない）
  {
    let edit = *edit_mode.0.lock().map_err(|e| e.to_string())?;
    let gen = *generation.0.lock().map_err(|e| e.to_string())?;
    if !generation_command_allowed(edit, gen) {
      return Err("生成が有効化されていません".to_string());
    }
  }

  // 同時実行 1 件の判定と cancel トークン設定を 1 回のロックで原子的に行う（TOCTOU 回避）。
  // Some = 生成中。既に Some なら別の生成が実行中
  let cancel = generation::CancelToken::new();
  {
    let mut slot = active.0.lock().map_err(|e| e.to_string())?;
    if slot.is_some() {
      return Err("別の生成が実行中です".to_string());
    }
    *slot = Some(cancel.clone());
  }

  // 実処理（MutexGuard は上のスコープで解放済み。await をまたいで保持しない）
  let result = run_generation(&request, &app, &cancel).await;

  // 後片付け（成功/失敗にかかわらず idle に戻す）
  if let Ok(mut slot) = active.0.lock() {
    *slot = None;
  }

  result.map_err(|e| e.to_string())
}

/// 実行中の生成を中断する（in-flight の生成器へ協調的に伝える。FR-010）。
#[tauri::command]
fn cancel_generation(active: tauri::State<ActiveGeneration>) -> Result<(), String> {
  if let Some(token) = active.0.lock().map_err(|e| e.to_string())?.as_ref() {
    token.cancel();
  }
  Ok(())
}

/// Vertex 設定（project/region/model）を保存する（編集モード必須・非秘密を plugin-store に平文保存）。
#[tauri::command]
fn set_vertex_config(
  config: vertex_config::VertexConfig,
  app: tauri::AppHandle,
  edit_mode: tauri::State<EditMode>,
) -> Result<(), String> {
  require_edit_mode(&edit_mode)?;
  vertex_config::set_vertex_config(&app, config)
}

/// Vertex 設定を消去する（編集モード必須）。
#[tauri::command]
fn clear_vertex_config(
  app: tauri::AppHandle,
  edit_mode: tauri::State<EditMode>,
) -> Result<(), String> {
  require_edit_mode(&edit_mode)?;
  vertex_config::clear_vertex_config(&app)
}

/// Vertex 設定を返す（フォームのプリフィル用。非秘密）。
#[tauri::command]
fn get_vertex_config(app: tauri::AppHandle) -> Result<Option<vertex_config::VertexConfig>, String> {
  vertex_config::get_vertex_config(&app)
}

/// Vertex 設定の状態（configured）のみ返す。事前ゲート表示のため常時呼べる（NFR-003）。
#[tauri::command]
fn get_vertex_status(app: tauri::AppHandle) -> Result<vertex_config::VertexStatus, String> {
  vertex_config::vertex_status(&app)
}

/// `gcloud auth application-default login` を起動して ADC を生成する（初回セットアップ・編集モード必須）。
/// 生成に必要なのは ADC ファイルのみで、以後の生成は Rust が ADC を読んでトークン交換する（実行時 gcloud 不要）。
#[tauri::command]
async fn gcloud_login(edit_mode: tauri::State<'_, EditMode>) -> Result<(), String> {
  require_edit_mode(&edit_mode)?;
  let binary = resolve_gcloud_binary()?;
  let status = bin_resolve::command_for_binary(&binary)
    .args(["auth", "application-default", "login"])
    .status()
    .await
    .map_err(|e| {
      format!("gcloud の起動に失敗しました（インストールと PATH を確認してください）: {e}")
    })?;
  if status.success() {
    // 再ログインで ADC が更新されたため、旧アカウント/失効トークンのキャッシュを破棄する。
    // これがないと次回生成が 55 分間キャッシュ済みの旧トークンを使い、案内どおり再ログインしても復旧しない。
    generation::invalidate_token_cache().await;
    Ok(())
  } else {
    Err("gcloud ログインに失敗しました".to_string())
  }
}

/// gcloud バイナリ名（Windows は `.cmd` 実体）。
#[cfg(windows)]
const GCLOUD_BINARY_NAME: &str = "gcloud.cmd";
#[cfg(not(windows))]
const GCLOUD_BINARY_NAME: &str = "gcloud";

/// `gcloud` バイナリを解決する（PATH → 代表配置）。
/// リリースビルドの GUI アプリは Finder/Dock 起動時に login shell の PATH（Homebrew や
/// Cloud SDK インストーラが `~/.zshrc` 等に追加したパス）を継承しないことがあるため、
/// PATH に見つからない場合は代表的なインストール先も候補にする
/// （`generation::claude_cli::resolve_claude_binary` と同じ対処方針。共通ロジックは `bin_resolve`）。
fn resolve_gcloud_binary() -> Result<PathBuf, String> {
  bin_resolve::resolve_binary(GCLOUD_BINARY_NAME, &gcloud_candidate_paths()).ok_or_else(|| {
    "gcloud コマンドが見つかりませんでした。インストールと PATH を確認してください".to_string()
  })
}

/// gcloud の代表的なインストール先（macOS/Linux）。
#[cfg(not(windows))]
fn gcloud_candidate_paths() -> Vec<PathBuf> {
  let mut paths = vec![
    PathBuf::from("/opt/homebrew/bin/gcloud"),
    PathBuf::from("/usr/local/bin/gcloud"),
  ];
  if let Some(home) = std::env::var_os("HOME") {
    paths.push(Path::new(&home).join("google-cloud-sdk/bin/gcloud"));
  }
  paths
}

#[cfg(windows)]
fn gcloud_candidate_paths() -> Vec<PathBuf> {
  Vec::new()
}

/// 外部生成（Claude Code CLI）が利用可能か返す（事前ゲート・FR-007。秘密に触れないため常時呼べる）。
#[tauri::command]
async fn check_claude_cli() -> Result<bool, String> {
  Ok(generation::external_generator_available().await)
}

/// 編集モードゲートつきの slides.json 書き込み（純粋ロジック。テストはこの関数を直接叩く）。
/// 編集モードが無効なら一切書き込まずに Err を返す
fn write_slides_json_gated(enabled: bool, path: &str, json: &str) -> Result<(), String> {
  if !enabled {
    return Err("編集モードが無効です".to_string());
  }
  fs::write(path, json).map_err(|e| e.to_string())
}

/// 編集した slides.json をローカルに保存する（書き込みは Rust 境界に集約し、fs write を JS へ開放しない）
#[tauri::command]
fn save_slides_json(
  path: String,
  json: String,
  state: tauri::State<EditMode>,
) -> Result<(), String> {
  let enabled = *state.0.lock().map_err(|e| e.to_string())?;
  write_slides_json_gated(enabled, &path, &json)
}

/// slides.json 内のアセットパス（image/ voice/ theme/ font/ 配下の相対参照）を再帰抽出する。
/// scripts/export-slides.mjs の extractAssetPaths と同一規則（先頭スラッシュを1個だけ除去・
/// 出現順を保持・重複排除・オブジェクトは値のみ走査）を単一真実源として移植する（DC-003）
fn extract_asset_paths(value: &serde_json::Value) -> Vec<String> {
  const PREFIXES: [&str; 4] = ["image/", "voice/", "theme/", "font/"];
  let mut paths: Vec<String> = Vec::new();
  walk_asset_paths(value, &PREFIXES, &mut paths);
  paths
}

fn walk_asset_paths(value: &serde_json::Value, prefixes: &[&str], paths: &mut Vec<String>) {
  match value {
    serde_json::Value::String(s) => {
      let normalized = s.strip_prefix('/').unwrap_or(s.as_str());
      if prefixes.iter().any(|p| normalized.starts_with(p))
        && !paths.iter().any(|existing| existing == normalized)
      {
        paths.push(normalized.to_string());
      }
    }
    serde_json::Value::Array(arr) => {
      for v in arr {
        walk_asset_paths(v, prefixes, paths);
      }
    }
    serde_json::Value::Object(map) => {
      for v in map.values() {
        walk_asset_paths(v, prefixes, paths);
      }
    }
    _ => {}
  }
}

/// package.json の files フィールドを組み立てる（export-slides.mjs の buildFilesField 相当）
fn build_files_field(asset_paths: &[String], include_addons: bool) -> Vec<String> {
  let mut files = vec!["slides.json".to_string()];
  for path in asset_paths {
    if let Some(dir) = path.split('/').next() {
      if !dir.is_empty() && !files.iter().any(|f| f == dir) {
        files.push(dir.to_string());
      }
    }
  }
  if include_addons {
    files.push("addons".to_string());
  }
  files
}

/// tar へ1ファイルを追加する（path は package/ 配下のパスを渡す）
fn append_tar_file<W: Write>(
  builder: &mut tar::Builder<W>,
  path: &str,
  bytes: &[u8],
) -> Result<(), String> {
  let mut header = tar::Header::new_gnu();
  header.set_path(path).map_err(|e| e.to_string())?;
  header.set_size(bytes.len() as u64);
  header.set_mode(0o644);
  header.set_cksum();
  builder.append(&header, bytes).map_err(|e| e.to_string())
}

/// 同梱対象 name に一致するアドオンだけを残した manifest（addons を絞った Value）と、その bundle 相対パス一覧を返す
/// （層B・FR-009）。各 bundle は addons/<basename> へ正規化し、残す manifest エントリにも同じ正規化値を書き戻すことで、
/// manifest とコピー対象を同一集合にして実行時 404 を防ぐ（export-slides.mjs の rewriteAddonManifestBundles 相当）。
/// basename 化は base_dir 外へのパストラバーサルも防ぐ（層A の sanitize_addon_name と防御一貫・DC-003）
fn filter_addon_manifest(
  manifest: &serde_json::Value,
  names: &[String],
) -> (serde_json::Value, Vec<String>) {
  let empty: Vec<serde_json::Value> = Vec::new();
  let addons = manifest
    .get("addons")
    .and_then(|a| a.as_array())
    .unwrap_or(&empty);
  let mut kept: Vec<serde_json::Value> = Vec::new();
  let mut bundles: Vec<String> = Vec::new();
  for addon in addons {
    let name_matches = addon
      .get("name")
      .and_then(|n| n.as_str())
      .map(|n| names.iter().any(|x| x == n))
      .unwrap_or(false);
    if !name_matches {
      continue;
    }
    // bundle を addons/<basename> へ正規化する（先頭スラッシュ1個除去 → addons/ 配下のみ採用 → basename 化）。
    // addons/ 配下でない/bundle 欠落のエントリは manifest からもコピー対象からも除外し、両集合を一致させる。
    let Some(normalized) = addon
      .get("bundle")
      .and_then(|b| b.as_str())
      .map(|b| b.strip_prefix('/').unwrap_or(b))
      .filter(|b| b.starts_with("addons/"))
      // basename 化はパストラバーサル防止も兼ねる。Windows のバックスラッシュ区切りも分割対象にする
      .and_then(|b| b.rsplit(['/', '\\']).next())
      .map(|basename| format!("addons/{}", basename))
    else {
      continue;
    };
    let mut entry = addon.clone();
    if let Some(obj) = entry.as_object_mut() {
      obj.insert(
        "bundle".to_string(),
        serde_json::Value::String(normalized.clone()),
      );
    }
    kept.push(entry);
    bundles.push(normalized);
  }
  let mut filtered = manifest.clone();
  if let Some(obj) = filtered.as_object_mut() {
    obj.insert("addons".to_string(), serde_json::Value::Array(kept));
  }
  (filtered, bundles)
}

/// 編集モードゲートつきのスライドパッケージ (.spkg) 生成（純粋ロジック。テストはこの関数を直接叩く）。
/// slides.json は無損失のため受け取った json 文字列をそのまま格納し、アセットは base_dir 基準で
/// 収集する（存在しないものは export-slides.mjs と同様スキップ）。全ファイルを package/ 配下へ
/// 格納して npm pack 慣習に合わせ、extract_slide_package で往復展開できる形にする（DC-003）
#[allow(clippy::too_many_arguments)]
fn build_slide_package_gated(
  enabled: bool,
  json: &str,
  out_dir: &str,
  base_dir: &str,
  name: &str,
  version: &str,
  included_addons: &[String],
  builtin_dist_dir: Option<&Path>,
) -> Result<String, String> {
  if !enabled {
    return Err("編集モードが無効です".to_string());
  }

  let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
  let asset_paths = extract_asset_paths(&value);
  let base = Path::new(base_dir);

  // 選択アドオンを層B（base_dir/addons）＋層A（組み込み dist・dev のみ）から集約して同梱する（FR-009・②）。
  // 層B優先で、層Aは層Bに無い名前だけを補完する。bundle の dest（package/addons/<basename>）が衝突する場合は
  // 別々の単一バンドルを統合できないため層Bを優先し層Aをスキップする。
  // (entry, dest 相対パス, コピー元ファイル) の三つ組。dest は package/ 配下の addons/<basename>。
  // entry と src を一体で持ち、後段で「実体のある bundle だけ」を manifest とコピー双方に反映する（レビュー#3）。
  let mut addon_items: Vec<(serde_json::Value, String, PathBuf)> = Vec::new();
  // 合成 manifest のベース（層Bの非 addons キーを保持。無ければ空オブジェクト）
  let mut manifest_base = serde_json::json!({});
  if !included_addons.is_empty() {
    // 層B: 読み込んだパッケージ自身のアドオン（base_dir/addons/manifest.json）
    if let Ok(text) = fs::read_to_string(base.join("addons").join("manifest.json")) {
      let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
      manifest_base = manifest.clone();
      let (filtered, bundles) = filter_addon_manifest(&manifest, included_addons);
      let entries: Vec<serde_json::Value> = filtered
        .get("addons")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
      // filter_addon_manifest は entries と bundles を同順・同数で返す
      for (entry, b) in entries.into_iter().zip(bundles) {
        let src = base.join(&b);
        addon_items.push((entry, b, src));
      }
    }
    // 層A: 組み込みアドオン（dev の addons/dist）。層Bで未取得の名前だけ補完する
    if let Some(dist) = builtin_dist_dir {
      let matched: Vec<String> = addon_items
        .iter()
        .filter_map(|(e, _, _)| {
          e.get("name")
            .and_then(|n| n.as_str())
            .map(|s| s.to_string())
        })
        .collect();
      let remaining: Vec<String> = included_addons
        .iter()
        .filter(|n| !matched.contains(n))
        .cloned()
        .collect();
      if !remaining.is_empty() {
        if let Ok(text) = fs::read_to_string(dist.join("manifest.json")) {
          let manifest: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| e.to_string())?;
          let (filtered, bundles) = filter_addon_manifest(&manifest, &remaining);
          let entries: Vec<serde_json::Value> = filtered
            .get("addons")
            .and_then(|a| a.as_array())
            .cloned()
            .unwrap_or_default();
          for (entry, b) in entries.into_iter().zip(bundles) {
            // dest 衝突（層Bと同じ package パス）は層B優先でスキップ
            if addon_items.iter().any(|(_, dest, _)| dest == &b) {
              continue;
            }
            // b は addons/<basename> に正規化済み。source は dist 直下の basename
            let basename = b.rsplit(['/', '\\']).next().unwrap_or(&b).to_string();
            let src = dist.join(basename);
            addon_items.push((entry, b, src));
          }
        }
      }
    }
  }
  // manifest とコピー対象を「実体のある bundle」に一致させる（存在しない bundle を manifest が参照して 404 になるのを防ぐ・レビュー#3）。
  let present: Vec<&(serde_json::Value, String, PathBuf)> = addon_items
    .iter()
    .filter(|(_, _, src)| src.is_file())
    .collect();
  let include_addons = !present.is_empty();
  // 合成 manifest（層Bの非 addons キーを保持しつつ addons を「実体のある選択集合」へ差し替え）
  let addon_manifest_text: Option<String> = if include_addons {
    let kept: Vec<serde_json::Value> = present.iter().map(|(e, _, _)| e.clone()).collect();
    if let Some(obj) = manifest_base.as_object_mut() {
      obj.insert("addons".to_string(), serde_json::Value::Array(kept));
    }
    Some(serde_json::to_string_pretty(&manifest_base).map_err(|e| e.to_string())?)
  } else {
    None
  };

  let package_json = serde_json::json!({
    "name": format!("@slides/{}", name),
    "version": version,
    "description": format!("Slide presentation package: {}", name),
    "slidePresentation": { "entry": "slides.json" },
    "files": build_files_field(&asset_paths, include_addons),
  });
  let package_json_text = serde_json::to_string_pretty(&package_json).map_err(|e| e.to_string())?;
  let readme = format!("# @slides/{}\n\nSlide presentation package.\n", name);

  let mut tar_bytes = Vec::new();
  {
    let mut builder = tar::Builder::new(&mut tar_bytes);
    append_tar_file(&mut builder, "package/slides.json", json.as_bytes())?;
    append_tar_file(
      &mut builder,
      "package/package.json",
      package_json_text.as_bytes(),
    )?;
    append_tar_file(&mut builder, "package/README.md", readme.as_bytes())?;

    // アセット同梱（base_dir 基準・存在するもののみ）
    for asset in &asset_paths {
      let src = base.join(asset);
      if src.is_file() {
        let bytes = fs::read(&src).map_err(|e| e.to_string())?;
        append_tar_file(&mut builder, &format!("package/{}", asset), &bytes)?;
      }
    }

    // 選択アドオンの同梱（層A/層B の bundle 本体＋合成 manifest）。is_file() ガードで manifest(present) と一致
    if include_addons {
      for (_, dest, src) in &addon_items {
        if src.is_file() {
          let bytes = fs::read(src).map_err(|e| e.to_string())?;
          append_tar_file(&mut builder, &format!("package/{}", dest), &bytes)?;
        }
      }
      if let Some(text) = &addon_manifest_text {
        append_tar_file(
          &mut builder,
          "package/addons/manifest.json",
          text.as_bytes(),
        )?;
      }
    }

    builder.finish().map_err(|e| e.to_string())?;
  }

  let mut gz_bytes = Vec::new();
  {
    let mut encoder = flate2::write::GzEncoder::new(&mut gz_bytes, flate2::Compression::default());
    encoder.write_all(&tar_bytes).map_err(|e| e.to_string())?;
    encoder.finish().map_err(|e| e.to_string())?;
  }

  let out = Path::new(out_dir);
  fs::create_dir_all(out).map_err(|e| e.to_string())?;
  let pkg_path = out.join(format!(
    "slides-{}-{}.{}",
    name, version, SLIDE_PACKAGE_EXTENSION
  ));
  fs::write(&pkg_path, &gz_bytes).map_err(|e| e.to_string())?;

  pkg_path
    .to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "出力パスの文字列化に失敗しました".to_string())
}

/// 編集した slides.json をアセットとともに .spkg パッケージへ書き出す（編集モード時のみ成功）
#[tauri::command]
fn export_slide_package(
  json: String,
  out_dir: String,
  base_dir: String,
  name: String,
  version: String,
  included_addons: Vec<String>,
  state: tauri::State<EditMode>,
) -> Result<String, String> {
  let enabled = *state.0.lock().map_err(|e| e.to_string())?;
  // 層A（組み込み addons/dist）の同梱は dev 限定。release では成果物が無いため渡さない（層Bのみ）
  let builtin_dist = builtin_dist_dir();
  let builtin_dist_opt = if cfg!(debug_assertions) {
    Some(builtin_dist.as_path())
  } else {
    None
  };
  build_slide_package_gated(
    enabled,
    &json,
    &out_dir,
    &base_dir,
    &name,
    &version,
    &included_addons,
    builtin_dist_opt,
  )
}

// ---- 層A: 組み込みアドオン（addons/src）の増減（dev 限定・要 npm run build:addons 再ビルド・DC-004） ----

/// 組み込みアドオンソースディレクトリ（addons/src）。コンパイル時の src-tauri の親をプロジェクトルートとする
/// （層A は dev 限定のためソースが同一マシンに存在する前提）
fn builtin_addons_dir() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| PathBuf::from("."))
    .join("addons")
    .join("src")
}

/// 組み込みアドオンのビルド成果物ディレクトリ（addons/dist）。層A を export に同梱する際の bundle/manifest 源。
/// 層A は dev 限定のため、成果物が同一マシンの addons/dist に存在する前提（release では export へ渡さない）。
fn builtin_dist_dir() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| PathBuf::from("."))
    .join("addons")
    .join("dist")
}

/// アドオン名を検証する（パストラバーサル防止。英数字・ハイフン・アンダースコアのみ許可）
fn sanitize_addon_name(name: &str) -> Result<String, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("アドオン名を入力してください".to_string());
  }
  if !trimmed
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
  {
    return Err("アドオン名は英数字・ハイフン・アンダースコアのみ使用できます".to_string());
  }
  Ok(trimmed.to_string())
}

/// 新規組み込みアドオンの entry.ts 雛形（addons/src/{name}/entry.ts の初期内容）を生成する
fn scaffold_entry_ts(name: &str) -> String {
  format!(
    "declare global {{\n  interface Window {{\n    __ADDON_REGISTER__?: (addonName: string, components: Array<{{ name: string; component: React.ComponentType<Record<string, unknown>> }}>) => void\n  }}\n}}\n\nconst register = window.__ADDON_REGISTER__\nif (register) {{\n  register('{name}', [\n    // ここにコンポーネントを登録します。例:\n    // {{ name: 'MyComponent', component: MyComponent }},\n  ])\n}}\n\nexport {{}}\n"
  )
}

/// 指定ディレクトリ配下の組み込みアドオン（サブディレクトリ）名を列挙する（純粋ロジック）
fn list_builtin_addons_at(dir: &Path) -> Result<Vec<String>, String> {
  if !dir.is_dir() {
    return Ok(Vec::new());
  }
  let mut names = Vec::new();
  for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    if entry.path().is_dir() {
      if let Some(name) = entry.file_name().to_str() {
        names.push(name.to_string());
      }
    }
  }
  names.sort();
  Ok(names)
}

/// dir/{name}/entry.ts を雛形付きで作成する（純粋ロジック。既存なら Err）
fn add_builtin_addon_at(dir: &Path, name: &str) -> Result<(), String> {
  let safe = sanitize_addon_name(name)?;
  let addon_dir = dir.join(&safe);
  if addon_dir.exists() {
    return Err(format!("アドオン {} は既に存在します", safe));
  }
  fs::create_dir_all(&addon_dir).map_err(|e| e.to_string())?;
  fs::write(addon_dir.join("entry.ts"), scaffold_entry_ts(&safe)).map_err(|e| e.to_string())?;
  Ok(())
}

/// dir/{name} を削除する（純粋ロジック。無ければ Err）
fn remove_builtin_addon_at(dir: &Path, name: &str) -> Result<(), String> {
  let safe = sanitize_addon_name(name)?;
  let addon_dir = dir.join(&safe);
  if !addon_dir.is_dir() {
    return Err(format!("アドオン {} が見つかりません", safe));
  }
  fs::remove_dir_all(&addon_dir).map_err(|e| e.to_string())
}

/// 組み込みアドオン（addons/src 配下）の一覧を返す（層A・dev 限定。release では空）。増減 UI 用（ソース）。
#[tauri::command]
fn list_builtin_addons() -> Result<Vec<String>, String> {
  if !cfg!(debug_assertions) {
    return Ok(Vec::new());
  }
  list_builtin_addons_at(&builtin_addons_dir())
}

/// manifest（`addons/dist/manifest.json` 等）から addon の name 一覧を取り出す純関数（テスト対象）。
fn addon_names_from_manifest(text: &str) -> Result<Vec<String>, String> {
  let manifest: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
  Ok(
    manifest
      .get("addons")
      .and_then(|a| a.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|a| {
            a.get("name")
              .and_then(|n| n.as_str())
              .map(|s| s.to_string())
          })
          .collect::<Vec<_>>()
      })
      .unwrap_or_default(),
  )
}

/// **ビルド済み**の組み込みアドオン（`addons/dist/manifest.json` に載る＝export で同梱可能）の name 一覧を返す。
/// export の層A選択候補はこちらを真実源にする（src にあるが未ビルドの名前を候補に出さない・レビュー#4/#6）。dev 限定。
#[tauri::command]
fn list_builtin_dist_addons() -> Result<Vec<String>, String> {
  if !cfg!(debug_assertions) {
    return Ok(Vec::new());
  }
  match fs::read_to_string(builtin_dist_dir().join("manifest.json")) {
    Ok(text) => addon_names_from_manifest(&text),
    Err(_) => Ok(Vec::new()),
  }
}

/// 組み込みアドオンを新規作成する（層A・dev 限定＋編集モードゲート。要 npm run build:addons 再ビルド）
#[tauri::command]
fn add_builtin_addon(name: String, state: tauri::State<EditMode>) -> Result<(), String> {
  if !cfg!(debug_assertions) {
    return Err("この操作は開発環境でのみ利用できます".to_string());
  }
  if !*state.0.lock().map_err(|e| e.to_string())? {
    return Err("編集モードが無効です".to_string());
  }
  add_builtin_addon_at(&builtin_addons_dir(), &name)
}

/// 組み込みアドオンを削除する（層A・dev 限定＋編集モードゲート。要再ビルド）
#[tauri::command]
fn remove_builtin_addon(name: String, state: tauri::State<EditMode>) -> Result<(), String> {
  if !cfg!(debug_assertions) {
    return Err("この操作は開発環境でのみ利用できます".to_string());
  }
  if !*state.0.lock().map_err(|e| e.to_string())? {
    return Err("編集モードが無効です".to_string());
  }
  remove_builtin_addon_at(&builtin_addons_dir(), &name)
}

/// npm パッケージスクリプト実行用のバイナリ名（Windows は `.cmd` 実体）。
fn npm_binary() -> &'static str {
  if cfg!(windows) {
    "npm.cmd"
  } else {
    "npm"
  }
}

/// プロジェクトルート（`src-tauri` の親）。組み込みアドオンのビルドはここを cwd に実行する。
fn project_root_dir() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| PathBuf::from("."))
}

/// 組み込みアドオンをアプリから再ビルドする（`npm run build:addons` を spawn。層A・dev 限定＋編集モード）。
/// 実行後 `addons/dist/manifest.json` が更新され、`list_builtin_dist_addons` に反映される。
#[tauri::command]
async fn build_builtin_addons(edit_mode: tauri::State<'_, EditMode>) -> Result<(), String> {
  if !cfg!(debug_assertions) {
    return Err("この操作は開発環境でのみ利用できます".to_string());
  }
  require_edit_mode(&edit_mode)?;
  let status = tokio::process::Command::new(npm_binary())
    .args(["run", "build:addons"])
    .current_dir(project_root_dir())
    .status()
    .await
    .map_err(|e| {
      format!("npm の起動に失敗しました（インストールと PATH を確認してください）: {e}")
    })?;
  if status.success() {
    Ok(())
  } else {
    Err("アドオンのビルドに失敗しました（addons/src の内容を確認してください）".to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .manage(EditMode(Mutex::new(false)))
    .manage(GenerationEnabled(Mutex::new(false)))
    .manage(ActiveGeneration(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      allow_asset_dir,
      extract_slide_package,
      download_slide_package,
      set_edit_mode,
      save_slides_json,
      export_slide_package,
      list_builtin_addons,
      list_builtin_dist_addons,
      add_builtin_addon,
      remove_builtin_addon,
      build_builtin_addons,
      set_generation_enabled,
      generate_slides,
      cancel_generation,
      set_vertex_config,
      clear_vertex_config,
      get_vertex_config,
      get_vertex_status,
      gcloud_login,
      check_claude_cli
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  /// package/slides.json を含む npm pack 形式の tar.gz バイト列を作る
  fn build_npm_pack_tgz(slides_json: &[u8]) -> Vec<u8> {
    let mut tar_bytes = Vec::new();
    {
      let mut builder = tar::Builder::new(&mut tar_bytes);
      let mut header = tar::Header::new_gnu();
      header.set_path("package/slides.json").unwrap();
      header.set_size(slides_json.len() as u64);
      header.set_cksum();
      builder.append(&header, slides_json).unwrap();
      builder.finish().unwrap();
    }

    let mut gz_bytes = Vec::new();
    {
      let mut encoder =
        flate2::write::GzEncoder::new(&mut gz_bytes, flate2::Compression::default());
      encoder.write_all(&tar_bytes).unwrap();
      encoder.finish().unwrap();
    }
    gz_bytes
  }

  /// base_dir/addons に viz・other の2アドオン（manifest + バンドル本体）を書き込む共通フィクスチャ。
  /// 層B の選択的同梱を検証する複数のテストで使い回す
  fn write_viz_other_addon_fixture(base_dir: &Path) {
    fs::create_dir_all(base_dir.join("addons")).unwrap();
    fs::write(
      base_dir.join("addons").join("manifest.json"),
      br#"{"addons":[{"name":"viz","bundle":"addons/viz.iife.js"},{"name":"other","bundle":"addons/other.iife.js"}]}"#,
    )
    .unwrap();
    fs::write(base_dir.join("addons").join("viz.iife.js"), b"VIZ").unwrap();
    fs::write(base_dir.join("addons").join("other.iife.js"), b"OTHER").unwrap();
  }

  #[test]
  fn extract_slide_archive_prefers_npm_pack_package_dir() {
    let content = b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}";
    let gz_bytes = build_npm_pack_tgz(content);

    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-{}", std::process::id()));
    let result = extract_slide_archive(&gz_bytes, &extract_dir).expect("extraction should succeed");

    assert_eq!(result, extract_dir.join("package"));
    let slides_json_path = result.join("slides.json");
    assert!(slides_json_path.is_file());
    assert_eq!(fs::read(&slides_json_path).unwrap(), content);

    fs::remove_dir_all(&extract_dir).ok();
  }

  #[test]
  fn extract_slide_archive_replaces_existing_dir() {
    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-replace-{}", std::process::id()));
    fs::create_dir_all(&extract_dir).unwrap();
    fs::write(extract_dir.join("stale.txt"), b"old").unwrap();

    let gz_bytes = build_npm_pack_tgz(b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}");
    extract_slide_archive(&gz_bytes, &extract_dir).expect("extraction should succeed");

    assert!(!extract_dir.join("stale.txt").exists());
    assert!(extract_dir.join("package").join("slides.json").is_file());

    fs::remove_dir_all(&extract_dir).ok();
  }

  #[test]
  fn save_slides_json_gated_rejects_when_disabled() {
    let path = std::env::temp_dir().join(format!(
      "slide-save-test-disabled-{}.json",
      std::process::id()
    ));
    fs::remove_file(&path).ok();

    let result = write_slides_json_gated(false, path.to_str().unwrap(), "{}");

    assert!(result.is_err());
    assert!(!path.exists(), "編集モード無効時はファイルを書き込まない");
  }

  #[test]
  fn save_slides_json_gated_writes_when_enabled() {
    let path = std::env::temp_dir().join(format!(
      "slide-save-test-enabled-{}.json",
      std::process::id()
    ));
    let json = "{\"meta\":{\"title\":\"t\"},\"slides\":[]}";

    write_slides_json_gated(true, path.to_str().unwrap(), json)
      .expect("編集モード有効時は書き込む");

    assert_eq!(fs::read_to_string(&path).unwrap(), json);

    fs::remove_file(&path).ok();
  }

  #[test]
  fn extract_asset_paths_matches_export_rules() {
    // export-slides.mjs の extractAssetPaths と同じ規則を検証（DC-003）
    let value: serde_json::Value = serde_json::from_str(
      r#"{"a":"image/x.png","b":"/voice/y.mp3","c":"//image/z.png","d":["theme/t.css","font/f.woff"],"e":"Image/nope.png","n":123}"#,
    )
    .unwrap();

    let paths = extract_asset_paths(&value);

    // 先頭スラッシュ1個は除去、"//..." は prefix 不一致で除外、大文字 "Image/" は除外、数値は無視
    assert_eq!(
      paths,
      vec![
        "image/x.png".to_string(),
        "voice/y.mp3".to_string(),
        "theme/t.css".to_string(),
        "font/f.woff".to_string(),
      ]
    );
  }

  #[test]
  fn export_slide_package_rejects_when_disabled() {
    let out_dir =
      std::env::temp_dir().join(format!("slide-export-disabled-{}", std::process::id()));
    fs::remove_dir_all(&out_dir).ok();

    let result = build_slide_package_gated(
      false,
      r#"{"meta":{"title":"t"},"slides":[]}"#,
      out_dir.to_str().unwrap(),
      "",
      "demo",
      "1.0.0",
      &[],
      None,
    );

    assert!(result.is_err());
    assert!(!out_dir.exists(), "編集モード無効時は出力しない");
  }

  #[test]
  fn export_slide_package_roundtrips_with_extract() {
    let dir = std::env::temp_dir().join(format!("slide-export-test-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    let base_dir = dir.join("src");
    let out_dir = dir.join("out");
    fs::create_dir_all(base_dir.join("image")).unwrap();
    fs::write(base_dir.join("image").join("logo.png"), b"PNGDATA").unwrap();

    // component props に含まれるアセット参照も無損失で残ることを含めて検証
    let json = r#"{"meta":{"title":"t"},"slides":[{"id":"s1","layout":"custom","content":{"component":{"name":"Image","props":{"src":"image/logo.png"}}}}]}"#;

    let pkg_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &[],
      None,
    )
    .expect("編集モード有効時は書き出す");

    assert!(
      pkg_path.ends_with(&format!(".{}", SLIDE_PACKAGE_EXTENSION)),
      "出力拡張子は .{}（issue #41: 独自拡張子への変更）",
      SLIDE_PACKAGE_EXTENSION
    );

    // 生成した .spkg を extract_slide_archive で展開し往復一致を検証（FR-007/DC-003）
    let bytes = fs::read(&pkg_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_slide_archive(&bytes, &extract_dir).expect("展開できる");

    assert_eq!(pkg, extract_dir.join("package"));
    assert_eq!(
      fs::read_to_string(pkg.join("slides.json")).unwrap(),
      json,
      "slides.json は無損失で往復する"
    );
    assert!(pkg.join("package.json").is_file());
    assert_eq!(
      fs::read(pkg.join("image").join("logo.png")).unwrap(),
      b"PNGDATA",
      "アセットが同梱される"
    );

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn filter_addon_manifest_keeps_only_selected() {
    let manifest: serde_json::Value = serde_json::from_str(
      r#"{"name":"@slides/x","addons":[{"name":"a","bundle":"addons/a.iife.js"},{"name":"b","bundle":"/addons/b.iife.js"},{"name":"c","bundle":"addons/c.iife.js"}]}"#,
    )
    .unwrap();

    let (filtered, bundles) = filter_addon_manifest(&manifest, &["a".to_string(), "b".to_string()]);

    // 選択された a,b のみ残る（c は name 非選択で除外）
    let kept = filtered.get("addons").unwrap().as_array().unwrap();
    assert_eq!(kept.len(), 2);
    // 先頭スラッシュ1個除去・addons/ 配下のみ
    assert_eq!(
      bundles,
      vec![
        "addons/a.iife.js".to_string(),
        "addons/b.iife.js".to_string()
      ]
    );
    // 残す manifest エントリの bundle も addons/<basename> に正規化される（先頭スラッシュ除去。コピー対象と同一集合）
    assert_eq!(
      kept[0].get("bundle").unwrap().as_str().unwrap(),
      "addons/a.iife.js"
    );
    assert_eq!(
      kept[1].get("bundle").unwrap().as_str().unwrap(),
      "addons/b.iife.js"
    );
    // addons 以外のキーは保持
    assert_eq!(filtered.get("name").unwrap().as_str().unwrap(), "@slides/x");
  }

  #[test]
  fn filter_addon_manifest_normalizes_and_blocks_traversal() {
    let manifest: serde_json::Value = serde_json::from_str(
      r#"{"addons":[
        {"name":"trav","bundle":"addons/../../../secret.js"},
        {"name":"nested","bundle":"addons/sub/deep.iife.js"},
        {"name":"outside","bundle":"dist/x.iife.js"},
        {"name":"nobundle"}
      ]}"#,
    )
    .unwrap();

    let (filtered, bundles) = filter_addon_manifest(
      &manifest,
      &[
        "trav".to_string(),
        "nested".to_string(),
        "outside".to_string(),
        "nobundle".to_string(),
      ],
    );

    // basename 化でパストラバーサルを無効化し、addons/ 直下へ収める
    assert_eq!(
      bundles,
      vec![
        "addons/secret.js".to_string(),
        "addons/deep.iife.js".to_string()
      ]
    );
    // addons/ 配下でない outside と bundle 欠落の nobundle は manifest からもコピー対象からも除外（両集合一致）
    let kept = filtered.get("addons").unwrap().as_array().unwrap();
    assert_eq!(kept.len(), 2);
    assert_eq!(
      kept[0].get("bundle").unwrap().as_str().unwrap(),
      "addons/secret.js"
    );
    assert_eq!(
      kept[1].get("bundle").unwrap().as_str().unwrap(),
      "addons/deep.iife.js"
    );
  }

  #[test]
  fn export_slide_package_bundles_selected_addons() {
    let dir = std::env::temp_dir().join(format!("slide-export-addon-test-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    let base_dir = dir.join("src");
    let out_dir = dir.join("out");
    write_viz_other_addon_fixture(&base_dir);

    let json = r#"{"meta":{"title":"t"},"slides":[]}"#;
    let pkg_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["viz".to_string()],
      None,
    )
    .expect("編集モード有効時は書き出す");

    let bytes = fs::read(&pkg_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_slide_archive(&bytes, &extract_dir).expect("展開できる");

    // 選択した viz のみ同梱され、other は含まれない（FR-009）
    assert_eq!(
      fs::read(pkg.join("addons").join("viz.iife.js")).unwrap(),
      b"VIZ"
    );
    assert!(
      !pkg.join("addons").join("other.iife.js").exists(),
      "非選択アドオンは含めない"
    );
    // 絞り込み後 manifest は viz のみ
    let manifest_text = fs::read_to_string(pkg.join("addons").join("manifest.json")).unwrap();
    let manifest: serde_json::Value = serde_json::from_str(&manifest_text).unwrap();
    let kept = manifest.get("addons").unwrap().as_array().unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].get("name").unwrap().as_str().unwrap(), "viz");

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn export_bundles_builtin_layer_a_when_not_in_package() {
    // 新規オーサリング（層B 無し）で組み込みアドオン（層A・addons/dist）を選択同梱できる（②）
    let dir = std::env::temp_dir().join(format!("slide-export-builtin-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    let base_dir = dir.join("src"); // 層B は空
    let dist_dir = dir.join("dist"); // 層A（組み込み）dist
    let out_dir = dir.join("out");
    fs::create_dir_all(&base_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("manifest.json"),
      br#"{"addons":[{"name":"biz","bundle":"/addons/addons.iife.js"}]}"#,
    )
    .unwrap();
    fs::write(dist_dir.join("addons.iife.js"), b"BUILTIN_BUNDLE").unwrap();

    let json = r#"{"meta":{"title":"t"},"slides":[]}"#;
    let pkg_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["biz".to_string()],
      Some(dist_dir.as_path()),
    )
    .expect("編集モード有効時は書き出す");

    let bytes = fs::read(&pkg_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_slide_archive(&bytes, &extract_dir).expect("展開できる");

    // 組み込みバンドルが dist から同梱される
    assert_eq!(
      fs::read(pkg.join("addons").join("addons.iife.js")).unwrap(),
      b"BUILTIN_BUNDLE"
    );
    // manifest に biz が入る
    let manifest: serde_json::Value =
      serde_json::from_str(&fs::read_to_string(pkg.join("addons").join("manifest.json")).unwrap())
        .unwrap();
    let kept = manifest.get("addons").unwrap().as_array().unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].get("name").unwrap().as_str().unwrap(), "biz");

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn export_prefers_layer_b_on_bundle_dest_collision() {
    // 層B と層A の bundle dest が同一（addons.iife.js）なら層B優先で層Aをスキップする
    let dir = std::env::temp_dir().join(format!("slide-export-collide-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    let base_dir = dir.join("src");
    let dist_dir = dir.join("dist");
    let out_dir = dir.join("out");
    fs::create_dir_all(base_dir.join("addons")).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    // 層B: a → addons/addons.iife.js（本体 = PKG）
    fs::write(
      base_dir.join("addons").join("manifest.json"),
      br#"{"addons":[{"name":"a","bundle":"addons/addons.iife.js"}]}"#,
    )
    .unwrap();
    fs::write(base_dir.join("addons").join("addons.iife.js"), b"PKG").unwrap();
    // 層A: b → 同じ addons/addons.iife.js（本体 = BUILTIN）
    fs::write(
      dist_dir.join("manifest.json"),
      br#"{"addons":[{"name":"b","bundle":"/addons/addons.iife.js"}]}"#,
    )
    .unwrap();
    fs::write(dist_dir.join("addons.iife.js"), b"BUILTIN").unwrap();

    let json = r#"{"meta":{"title":"t"},"slides":[]}"#;
    let pkg_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["a".to_string(), "b".to_string()],
      Some(dist_dir.as_path()),
    )
    .expect("書き出す");

    let bytes = fs::read(&pkg_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_slide_archive(&bytes, &extract_dir).expect("展開できる");

    // dest 衝突は層B優先: バンドル本体は PKG（層B）が残る
    assert_eq!(
      fs::read(pkg.join("addons").join("addons.iife.js")).unwrap(),
      b"PKG"
    );
    // manifest には層Bの a のみ（衝突した層A b は落とす）
    let manifest: serde_json::Value =
      serde_json::from_str(&fs::read_to_string(pkg.join("addons").join("manifest.json")).unwrap())
        .unwrap();
    let kept = manifest.get("addons").unwrap().as_array().unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].get("name").unwrap().as_str().unwrap(), "a");

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn issue35_uncheck_and_reexport_with_same_name_version_excludes_addon() {
    // #35 再現調査: 「同梱アドオンをアンチェックして再書き出し」を、同名・同バージョンでの
    // 上書き書き出し→再オープン（extract_slide_package はファイル名 stem 基準の展開先を再利用する）
    // まで含めて模擬する。展開先を1回目・2回目とも同一ディレクトリで extract_slide_archive し、
    // 古い（除外前の）アドオンが残存しないことを確認する。
    let dir = std::env::temp_dir().join(format!("slide-issue35-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    let base_dir = dir.join("src");
    let out_dir = dir.join("out"); // 1回目・2回目とも同じ出力先ディレクトリ（上書き相当）
    write_viz_other_addon_fixture(&base_dir);

    let json = r#"{"meta":{"title":"t"},"slides":[]}"#;

    // 1回目: viz・other とも選択して書き出す（名前・バージョンは変更しない前提を再現）
    let pkg_path_1 = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["viz".to_string(), "other".to_string()],
      None,
    )
    .expect("1回目は両方選択で書き出す");

    // extract_slide_package は tgz のファイル名 stem（例: slides-demo-1.0.0）で展開先を決めるため、
    // 名前・バージョン不変の再書き出しは同じ展開先ディレクトリを再利用する。
    // ここでは実コマンドと同じ file_stem 由来の名前で展開先を作り、その再利用を模擬する
    let stem = Path::new(&pkg_path_1)
      .file_stem()
      .and_then(|s| s.to_str())
      .unwrap()
      .to_string();
    let extract_dir = dir.join("slide-packages").join(&stem);
    let pkg1 = extract_slide_archive(&fs::read(&pkg_path_1).unwrap(), &extract_dir)
      .expect("1回目展開できる");
    assert!(
      pkg1.join("addons").join("other.iife.js").is_file(),
      "1回目は other も同梱されている"
    );

    // 2回目: other のチェックを外して再書き出し（同じ out_dir・同じ name/version = 上書き）
    let pkg_path_2 = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["viz".to_string()],
      None,
    )
    .expect("2回目は viz のみ選択で書き出す");
    assert_eq!(
      pkg_path_1, pkg_path_2,
      "同名・同バージョンなら同じ出力パスを上書きする"
    );

    // 再オープン: 同じ展開先ディレクトリへ再展開（extract_slide_archive は毎回 remove_dir_all するため
    // 古い other.iife.js が残存すればキャッシュ/掃除漏れのバグ）
    let pkg2 = extract_slide_archive(&fs::read(&pkg_path_2).unwrap(), &extract_dir)
      .expect("2回目展開できる");
    assert!(
      !pkg2.join("addons").join("other.iife.js").exists(),
      "アンチェックした other は再書き出し後の再展開でも残存しない"
    );
    assert!(
      pkg2.join("addons").join("viz.iife.js").is_file(),
      "選択したままの viz は残る"
    );

    let manifest: serde_json::Value =
      serde_json::from_str(&fs::read_to_string(pkg2.join("addons").join("manifest.json")).unwrap())
        .unwrap();
    let kept_names: Vec<&str> = manifest
      .get("addons")
      .unwrap()
      .as_array()
      .unwrap()
      .iter()
      .map(|a| a.get("name").unwrap().as_str().unwrap())
      .collect();
    assert_eq!(kept_names, vec!["viz"], "manifest にも other は残らない");

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn addon_names_from_manifest_extracts_names() {
    // 層A export 候補の真実源（dist manifest）から name を取り出す
    let names = addon_names_from_manifest(
      r#"{"addons":[{"name":"a","bundle":"/addons/x.js"},{"name":"b"}]}"#,
    )
    .unwrap();
    assert_eq!(names, vec!["a".to_string(), "b".to_string()]);
    // addons 無し・空は空配列
    assert!(addon_names_from_manifest(r#"{}"#).unwrap().is_empty());
    assert!(addon_names_from_manifest(r#"{"addons":[]}"#)
      .unwrap()
      .is_empty());
    // 不正 JSON は Err
    assert!(addon_names_from_manifest("nope").is_err());
  }

  #[test]
  fn sanitize_addon_name_rejects_unsafe_names() {
    assert!(sanitize_addon_name("").is_err());
    assert!(sanitize_addon_name("   ").is_err());
    assert!(
      sanitize_addon_name("../evil").is_err(),
      "パストラバーサルを拒否"
    );
    assert!(sanitize_addon_name("a/b").is_err(), "スラッシュを拒否");
    assert!(sanitize_addon_name("あ").is_err(), "非 ASCII を拒否");
    assert_eq!(sanitize_addon_name(" my-addon_1 ").unwrap(), "my-addon_1");
  }

  #[test]
  fn add_list_remove_builtin_addon_roundtrip() {
    let dir = std::env::temp_dir().join(format!("builtin-addon-test-{}", std::process::id()));
    fs::remove_dir_all(&dir).ok();
    fs::create_dir_all(&dir).unwrap();

    // 追加 → entry.ts が雛形付きで作られ、一覧に現れる
    add_builtin_addon_at(&dir, "my-addon").expect("追加できる");
    let entry = dir.join("my-addon").join("entry.ts");
    assert!(entry.is_file());
    let content = fs::read_to_string(&entry).unwrap();
    assert!(
      content.contains("register('my-addon'"),
      "雛形に addon 名が入る"
    );
    assert!(content.contains("__ADDON_REGISTER__"));

    assert_eq!(
      list_builtin_addons_at(&dir).unwrap(),
      vec!["my-addon".to_string()]
    );

    // 既存名は Err（上書きしない）
    assert!(add_builtin_addon_at(&dir, "my-addon").is_err());

    // 削除 → 一覧から消える
    remove_builtin_addon_at(&dir, "my-addon").expect("削除できる");
    assert!(list_builtin_addons_at(&dir).unwrap().is_empty());
    // 無い名の削除は Err
    assert!(remove_builtin_addon_at(&dir, "my-addon").is_err());

    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn generation_enable_requires_edit_mode() {
    // 編集モード無効時は生成の有効化を拒否する（DC-003 / FR-009）
    assert!(resolve_generation_enabled(false, true).is_err());
    // 編集モード有効時は有効化できる
    assert!(resolve_generation_enabled(true, true).unwrap());
    // 無効化は編集モードに関わらず常に許可（生成の停止は妨げない）
    assert!(!resolve_generation_enabled(false, false).unwrap());
    assert!(!resolve_generation_enabled(true, false).unwrap());
  }

  #[test]
  fn validate_download_url_accepts_https_only() {
    // https は許可（issue #40）
    assert!(validate_download_url("https://example.com/deck.spkg").is_ok());
    // http・file 等の非 https スキームは拒否
    assert!(validate_download_url("http://example.com/deck.spkg").is_err());
    assert!(validate_download_url("file:///etc/passwd").is_err());
    // URL として不正な文字列も拒否
    assert!(validate_download_url("not a url").is_err());
  }

  #[test]
  fn url_cache_stem_is_deterministic_and_unique_per_url() {
    // 同一 URL は同じ展開先名（再オープン時の上書き再利用）
    assert_eq!(
      url_cache_stem("https://example.com/a.spkg"),
      url_cache_stem("https://example.com/a.spkg")
    );
    // 異なる URL は異なる展開先名（衝突回避）
    assert_ne!(
      url_cache_stem("https://example.com/a.spkg"),
      url_cache_stem("https://example.com/b.spkg")
    );
  }

  #[test]
  fn generate_command_gate_requires_edit_mode_and_generation_enabled() {
    // 生成コマンドは「編集モード かつ 生成有効」の両方が揃うときのみ許可（FR-009・NFR-003）。
    // どちらか欠ければ keyring/network に到達しない
    assert!(!generation_command_allowed(false, false));
    assert!(!generation_command_allowed(true, false));
    assert!(!generation_command_allowed(false, true));
    assert!(generation_command_allowed(true, true));
  }
}
