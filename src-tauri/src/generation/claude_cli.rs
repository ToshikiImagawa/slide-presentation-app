//! 外部生成（ローカル `claude` CLI サブプロセス）— FR-002 外部。
//!
//! 外部は完結エージェント。生 Messages を渡さず `claude --print --output-format json --strict-mcp-config
//! --max-turns 1` を一時 cwd で spawn し、結果 JSON（`result` 文字列）を受け取る。API キー不要。
//! タイムアウト安全弁（`tokio::time::timeout`）・`kill_on_drop`・`is_error` 判定を備える
//! （`claude_cli/llm_client.rs` 流用）。バイナリ検出は env override → PATH → 代表配置の順。
//! GUI 起動は login shell の環境変数を継承しないことがあるため、`claude_cli_config`（plugin-store）に
//! 保存された環境変数（`CLAUDE_CONFIG_DIR` 等）をサブプロセスへ明示的に注入できる（#152）。

use super::{CancelToken, GenerateError, GenerateRequest, SlideGenerator};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// 外部 CLI の単発推論タイムアウト（外部は内蔵より処理が長くなりうるため広めに取る）。
const CLI_TIMEOUT: Duration = Duration::from_secs(180);
/// 事前ゲートの `--version` 判定タイムアウト（応答が無ければ未検出扱い・FR-007）。
const VERSION_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
/// バイナリの明示指定（テスト・特殊環境向け）。
const CLAUDE_BIN_ENV: &str = "SLIDE_APP_CLAUDE_BIN";

#[cfg(windows)]
const CLAUDE_BINARY_NAME: &str = "claude.exe";
#[cfg(not(windows))]
const CLAUDE_BINARY_NAME: &str = "claude";

/// 外部 Claude Code 生成器。モデルは CLI の `--model` エイリアスへ写像する。
pub struct ClaudeCodeGenerator {
  model: String,
  /// サブプロセスへ明示的に注入する環境変数（`CLAUDE_CONFIG_DIR` 等。#152）。
  env_vars: Vec<(String, String)>,
}

impl ClaudeCodeGenerator {
  pub fn new(model: String, env_vars: Vec<(String, String)>) -> Self {
    Self { model, env_vars }
  }
}

#[async_trait::async_trait]
impl SlideGenerator for ClaudeCodeGenerator {
  async fn generate(
    &self,
    req: &GenerateRequest,
    cancel: &CancelToken,
  ) -> Result<String, GenerateError> {
    if cancel.is_cancelled() {
      return Err(GenerateError::Cancelled);
    }

    let binary = resolve_claude_binary()?;
    let args = build_cli_args(&self.model);
    let prompt = super::user_prompt(req);

    // in-flight のサブプロセスをキャンセルと競わせる。キャンセル時は run_cli future（child 所有）が drop され、
    // kill_on_drop で子プロセスが kill される（AtomicBool の観測だけでは止められないため・design §6/FR-010）
    tokio::select! {
      biased;
      _ = cancel.cancelled() => Err(GenerateError::Cancelled),
      result = run_cli(&binary, &args, &prompt, &self.env_vars) => result,
    }
  }
}

/// `claude` を spawn し stdin にプロンプトを渡して結果 JSON を受領する（child を所有）。
/// この future が drop されると child も drop され、kill_on_drop で子プロセスが kill される（中断・design §6）。
/// GUI 起動の Tauri アプリはシェルプロファイル経由の環境変数を継承しないことがあるため、
/// `env_vars`（`CLAUDE_CONFIG_DIR` 等・#152）を明示的に注入する。
async fn run_cli(
  binary: &Path,
  args: &[String],
  prompt: &str,
  env_vars: &[(String, String)],
) -> Result<String, GenerateError> {
  let mut command = tokio::process::Command::new(binary);
  command
    .args(args)
    .current_dir(std::env::temp_dir()) // ローカル CLAUDE.md / hooks を巻き込まない
    .envs(env_vars.iter().map(|(k, v)| (k.as_str(), v.as_str())))
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true); // ドロップ（タイムアウト/中断）で子プロセスを確実に kill
  let mut child = command
    .spawn()
    .map_err(|e| GenerateError::Cli(format!("claude プロセスの起動に失敗しました: {e}")))?;

  // ユーザープロンプトを stdin へ書き込む（失敗は空実行を防ぐためエラーで返す）
  if let Some(mut stdin) = child.stdin.take() {
    stdin
      .write_all(prompt.as_bytes())
      .await
      .map_err(|e| GenerateError::Cli(format!("claude への入力書き込みに失敗: {e}")))?;
    let _ = stdin.shutdown().await;
  }

  let mut stdout = child
    .stdout
    .take()
    .ok_or_else(|| GenerateError::Cli("標準出力を取得できません".to_string()))?;
  let mut stderr = child
    .stderr
    .take()
    .ok_or_else(|| GenerateError::Cli("標準エラーを取得できません".to_string()))?;

  // stdout/stderr を同時に読みつつ終了を待つ（パイプ充填によるデッドロック回避）
  let run = async {
    let mut out = String::new();
    let mut err = String::new();
    let (out_res, _err_res) = tokio::join!(
      stdout.read_to_string(&mut out),
      stderr.read_to_string(&mut err)
    );
    out_res.map_err(|e| GenerateError::Cli(format!("出力の読み取りに失敗: {e}")))?;
    let status = child
      .wait()
      .await
      .map_err(|e| GenerateError::Cli(format!("終了待機に失敗: {e}")))?;
    Ok::<(String, std::process::ExitStatus, String), GenerateError>((out, status, err))
  };

  let (out, status, err) = match tokio::time::timeout(CLI_TIMEOUT, run).await {
    Ok(result) => result?,
    // タイムアウト時は child を drop → kill_on_drop で kill
    Err(_) => return Err(GenerateError::Timeout),
  };

  if !status.success() {
    let detail = if !err.trim().is_empty() {
      err.trim().to_string()
    } else {
      out.trim().to_string()
    };
    return Err(GenerateError::Cli(format!(
      "claude が異常終了しました（{status}）: {}",
      super::truncate_preview(&detail, 500)
    )));
  }

  parse_result_json(&out)
}

/// 外部生成（Claude Code CLI）が利用可能か判定する（事前ゲート・FR-007）。
/// `claude` を検出し `--version` が正常終了すれば true。未検出・非ゼロ終了・タイムアウトは未検出扱い（false）。
pub async fn is_available() -> bool {
  let Ok(binary) = resolve_claude_binary() else {
    return false;
  };
  let mut command = tokio::process::Command::new(&binary);
  command
    .arg("--version")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .kill_on_drop(true);
  let Ok(mut child) = command.spawn() else {
    return false;
  };
  match tokio::time::timeout(VERSION_CHECK_TIMEOUT, child.wait()).await {
    Ok(Ok(status)) => status.success(),
    Ok(Err(_)) => false,
    Err(_) => {
      let _ = child.kill().await;
      false
    }
  }
}

/// `claude` バイナリを解決する（env override → PATH → 代表配置）。
/// GUI アプリは login shell の PATH を継承しないことがあるため代表配置も候補に持つ
/// （PATH → 代表配置の共通ロジックは `crate::bin_resolve`）。
fn resolve_claude_binary() -> Result<PathBuf, GenerateError> {
  if let Some(explicit) = std::env::var_os(CLAUDE_BIN_ENV) {
    let path = PathBuf::from(explicit);
    if path.is_file() {
      return Ok(path);
    }
  }
  crate::bin_resolve::resolve_binary(CLAUDE_BINARY_NAME, &candidate_paths()).ok_or_else(|| {
    GenerateError::Cli(
      "Claude Code（claude コマンド）が見つかりませんでした。インストールと PATH を確認してください"
        .to_string(),
    )
  })
}

/// 代表的なインストール先（macOS/Linux）。
#[cfg(not(windows))]
fn candidate_paths() -> Vec<PathBuf> {
  let mut paths = vec![
    PathBuf::from("/opt/homebrew/bin/claude"),
    PathBuf::from("/usr/local/bin/claude"),
    PathBuf::from("/usr/bin/claude"),
  ];
  if let Some(home) = std::env::var_os("HOME") {
    paths.push(Path::new(&home).join(".claude/local/claude"));
  }
  paths
}

#[cfg(windows)]
fn candidate_paths() -> Vec<PathBuf> {
  Vec::new()
}

/// CLI 起動引数を構築する（tools なし単発を保証・ユーザ環境の MCP を無視）。
fn build_cli_args(model: &str) -> Vec<String> {
  let mut args = vec![
    "--print".to_string(),
    "--output-format".to_string(),
    "json".to_string(),
    "--strict-mcp-config".to_string(),
    "--max-turns".to_string(),
    "1".to_string(),
    "--append-system-prompt".to_string(),
    super::system_prompt(),
  ];
  if let Some(alias) = map_model_to_cli_alias(model) {
    args.push("--model".to_string());
    args.push(alias.to_string());
  }
  args
}

/// モデル ID を CLI の `--model` エイリアスへ写像する。不明モデルは省略し CLI 既定に委ねる。
fn map_model_to_cli_alias(model: &str) -> Option<&'static str> {
  let lower = model.to_ascii_lowercase();
  if lower.starts_with("claude-opus") {
    Some("opus")
  } else if lower.starts_with("claude-sonnet") {
    Some("sonnet")
  } else if lower.starts_with("claude-haiku") {
    Some("haiku")
  } else {
    None
  }
}

/// `claude --output-format json` の結果を解釈する。
/// 形式: `{"type":"result","is_error":false,"result":"...","session_id":"..."}`
fn parse_result_json(output: &str) -> Result<String, GenerateError> {
  let trimmed = output.trim();
  let value: Value = serde_json::from_str(trimmed).map_err(|e| {
    GenerateError::InvalidResponse(format!("claude の result JSON パースに失敗: {e}"))
  })?;

  if value.get("is_error").and_then(|v| v.as_bool()) == Some(true) {
    let msg = value
      .get("result")
      .and_then(|v| v.as_str())
      .unwrap_or("詳細不明");
    return Err(GenerateError::Cli(format!(
      "claude がエラーを返しました: {msg}"
    )));
  }

  let result_text = value
    .get("result")
    .and_then(|v| v.as_str())
    .ok_or_else(|| {
      GenerateError::InvalidResponse("claude の出力に result フィールドがありません".to_string())
    })?;
  Ok(super::strip_code_fences(result_text))
}

#[cfg(test)]
mod tests {
  use super::super::{GenerateError, SlideGeneratorKind};
  use super::*;

  #[test]
  fn build_cli_args_has_expected_flags_and_model() {
    let args = build_cli_args("claude-opus-4-8");
    assert!(args.contains(&"--print".to_string()));
    // --output-format json
    let ofi = args.iter().position(|a| a == "--output-format").unwrap();
    assert_eq!(args[ofi + 1], "json");
    assert!(args.contains(&"--strict-mcp-config".to_string()));
    // --max-turns 1
    let mti = args.iter().position(|a| a == "--max-turns").unwrap();
    assert_eq!(args[mti + 1], "1");
    assert!(args.contains(&"--append-system-prompt".to_string()));
    // opus モデルは --model opus
    let mi = args.iter().position(|a| a == "--model").unwrap();
    assert_eq!(args[mi + 1], "opus");
  }

  #[test]
  fn build_cli_args_omits_model_for_unknown() {
    let args = build_cli_args("gpt-4o");
    assert!(!args.contains(&"--model".to_string()));
  }

  #[test]
  fn map_model_to_cli_alias_maps_families() {
    assert_eq!(map_model_to_cli_alias("claude-opus-4-8"), Some("opus"));
    assert_eq!(map_model_to_cli_alias("claude-sonnet-5"), Some("sonnet"));
    assert_eq!(map_model_to_cli_alias("claude-haiku-4-5"), Some("haiku"));
    assert_eq!(map_model_to_cli_alias("unknown-model"), None);
  }

  #[test]
  fn parse_result_json_extracts_result_and_strips_fences() {
    let output = r#"{"type":"result","is_error":false,"result":"```json\n{\"meta\":{\"title\":\"t\"},\"slides\":[]}\n```","session_id":"abc"}"#;
    let parsed = parse_result_json(output).unwrap();
    assert_eq!(parsed, "{\"meta\":{\"title\":\"t\"},\"slides\":[]}");
  }

  #[test]
  fn parse_result_json_detects_is_error() {
    let output = r#"{"type":"result","is_error":true,"result":"rate limited"}"#;
    assert!(matches!(
      parse_result_json(output),
      Err(GenerateError::Cli(_))
    ));
  }

  #[test]
  fn parse_result_json_errors_on_missing_result_or_invalid_json() {
    // result 欠落
    let output = r#"{"type":"result","is_error":false}"#;
    assert!(matches!(
      parse_result_json(output),
      Err(GenerateError::InvalidResponse(_))
    ));
    // JSON 不正
    assert!(matches!(
      parse_result_json("not json"),
      Err(GenerateError::InvalidResponse(_))
    ));
  }

  #[test]
  fn new_stores_model_and_env_vars() {
    // コンストラクタが種別に依存せずモデル/環境変数を保持する（factory から生成される）
    let env_vars = vec![("CLAUDE_CONFIG_DIR".to_string(), "/tmp/x".to_string())];
    let gen = ClaudeCodeGenerator::new("claude-opus-4-8".to_string(), env_vars.clone());
    assert_eq!(gen.model, "claude-opus-4-8");
    assert_eq!(gen.env_vars, env_vars);
    let _ = SlideGeneratorKind::ExternalClaudeCode; // 種別列挙の存在確認
  }
}
