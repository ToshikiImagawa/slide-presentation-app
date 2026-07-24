use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

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

/// tgz バイト列を extract_dir に展開し、slides.json のあるディレクトリを返す
/// （`npm pack` は内容を package/ 配下にネストするため、scripts/export-slides.mjs 由来の
/// tgz と同じ規則で package/ を優先的に探す）
fn extract_tgz(bytes: &[u8], extract_dir: &Path) -> Result<PathBuf, String> {
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

/// スライドパッケージ (.tgz) をアプリのキャッシュディレクトリに展開し、slides.json のあるディレクトリを返す
#[tauri::command]
fn extract_slide_package(app: tauri::AppHandle, tgz_path: String) -> Result<String, String> {
  let bytes = fs::read(&tgz_path).map_err(|e| e.to_string())?;

  let stem = Path::new(&tgz_path)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("package");
  let extract_dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| e.to_string())?
    .join("slide-packages")
    .join(stem);

  let result_dir = extract_tgz(&bytes, &extract_dir)?;
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
      .and_then(|b| b.rsplit('/').next())
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

/// 編集モードゲートつきのスライドパッケージ (.tgz) 生成（純粋ロジック。テストはこの関数を直接叩く）。
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
) -> Result<String, String> {
  if !enabled {
    return Err("編集モードが無効です".to_string());
  }

  let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
  let asset_paths = extract_asset_paths(&value);
  let base = Path::new(base_dir);

  // 層B: included_addons が非空なら base_dir/addons/manifest.json から選択アドオンだけを同梱する（FR-009）
  let mut addon_manifest_text: Option<String> = None;
  let mut addon_bundles: Vec<String> = Vec::new();
  if !included_addons.is_empty() {
    if let Ok(text) = fs::read_to_string(base.join("addons").join("manifest.json")) {
      let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
      let (filtered, bundles) = filter_addon_manifest(&manifest, included_addons);
      addon_bundles = bundles;
      addon_manifest_text =
        Some(serde_json::to_string_pretty(&filtered).map_err(|e| e.to_string())?);
    }
  }
  // 実ファイルが1つ以上存在するときだけ addons を同梱する（export-slides.mjs の includeAddons = copied>0 相当）。
  // 選択したが bundle 実体が無い場合に files へ空の "addons" を足さないため（DC-003）
  let include_addons = addon_bundles.iter().any(|b| base.join(b).is_file());

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

    // 層B: 選択アドオンの同梱（bundle 本体＋絞り込み後の manifest）
    if include_addons {
      for bundle in &addon_bundles {
        let src = base.join(bundle);
        if src.is_file() {
          let bytes = fs::read(&src).map_err(|e| e.to_string())?;
          append_tar_file(&mut builder, &format!("package/{}", bundle), &bytes)?;
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
  let tgz_path = out.join(format!("slides-{}-{}.tgz", name, version));
  fs::write(&tgz_path, &gz_bytes).map_err(|e| e.to_string())?;

  tgz_path
    .to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "出力パスの文字列化に失敗しました".to_string())
}

/// 編集した slides.json をアセットとともに .tgz パッケージへ書き出す（編集モード時のみ成功）
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
  build_slide_package_gated(
    enabled,
    &json,
    &out_dir,
    &base_dir,
    &name,
    &version,
    &included_addons,
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

/// 組み込みアドオン（addons/src 配下）の一覧を返す（層A・dev 限定。release では空）
#[tauri::command]
fn list_builtin_addons() -> Result<Vec<String>, String> {
  if !cfg!(debug_assertions) {
    return Ok(Vec::new());
  }
  list_builtin_addons_at(&builtin_addons_dir())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .manage(EditMode(Mutex::new(false)))
    .invoke_handler(tauri::generate_handler![
      allow_asset_dir,
      extract_slide_package,
      set_edit_mode,
      save_slides_json,
      export_slide_package,
      list_builtin_addons,
      add_builtin_addon,
      remove_builtin_addon
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

  #[test]
  fn extract_tgz_prefers_npm_pack_package_dir() {
    let content = b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}";
    let gz_bytes = build_npm_pack_tgz(content);

    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-{}", std::process::id()));
    let result = extract_tgz(&gz_bytes, &extract_dir).expect("extraction should succeed");

    assert_eq!(result, extract_dir.join("package"));
    let slides_json_path = result.join("slides.json");
    assert!(slides_json_path.is_file());
    assert_eq!(fs::read(&slides_json_path).unwrap(), content);

    fs::remove_dir_all(&extract_dir).ok();
  }

  #[test]
  fn extract_tgz_replaces_existing_dir() {
    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-replace-{}", std::process::id()));
    fs::create_dir_all(&extract_dir).unwrap();
    fs::write(extract_dir.join("stale.txt"), b"old").unwrap();

    let gz_bytes = build_npm_pack_tgz(b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}");
    extract_tgz(&gz_bytes, &extract_dir).expect("extraction should succeed");

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

    let tgz_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &[],
    )
    .expect("編集モード有効時は書き出す");

    // 生成した .tgz を extract_tgz で展開し往復一致を検証（FR-007/DC-003）
    let bytes = fs::read(&tgz_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_tgz(&bytes, &extract_dir).expect("展開できる");

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
    fs::create_dir_all(base_dir.join("addons")).unwrap();
    fs::write(
      base_dir.join("addons").join("manifest.json"),
      br#"{"addons":[{"name":"viz","bundle":"addons/viz.iife.js"},{"name":"other","bundle":"addons/other.iife.js"}]}"#,
    )
    .unwrap();
    fs::write(base_dir.join("addons").join("viz.iife.js"), b"VIZ").unwrap();
    fs::write(base_dir.join("addons").join("other.iife.js"), b"OTHER").unwrap();

    let json = r#"{"meta":{"title":"t"},"slides":[]}"#;
    let tgz_path = build_slide_package_gated(
      true,
      json,
      out_dir.to_str().unwrap(),
      base_dir.to_str().unwrap(),
      "demo",
      "1.0.0",
      &["viz".to_string()],
    )
    .expect("編集モード有効時は書き出す");

    let bytes = fs::read(&tgz_path).unwrap();
    let extract_dir = dir.join("extract");
    let pkg = extract_tgz(&bytes, &extract_dir).expect("展開できる");

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
}
