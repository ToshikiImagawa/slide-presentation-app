//! OPC（Open Packaging Conventions）の最小リーダ（#167）。
//!
//! `.pptx` / `.potx` / `.thmx` を 1 経路で扱う。3 形式は内部レイアウトが違うが、関係（`_rels`）を辿れば一本化できる:
//!
//! ```text
//! _rels/.rels の officeDocument
//!   ├─ themeManager（.thmx）→ その rels の theme と officeDocument を辿る
//!   └─ presentation（.pptx / .potx）→ そのまま presentation
//! presentation → p:sldMasterIdLst 先頭の r:id → slideMaster → その rels の theme
//! ```
//!
//! part の種類判定は `[Content_Types].xml` に委ね、パス名から推測しない。
//! 実物の `.thmx` は theme part を 8 個（本体＋バリアント 7）持つため、`theme1.xml` を名前で探すと取り違える。
//!
//! 信頼できない zip を読むため、既存の `.spkg` 展開（`lib.rs` の tar+gzip。自前で書き出したパッケージ前提で
//! ディスクへ展開する）とは完全に別経路にし、上限とパス検査を必ず通す。**ディスクへは一切書き出さない。**

use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom};

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use zip::ZipArchive;

use super::{attr, local_name, BrandError};

/// アーカイブ自体のサイズ上限。動画入りの配布テンプレートでも数十 MB に収まる
const MAX_ARCHIVE_SIZE: u64 = 256 * 1024 * 1024;
/// zip エントリ数の上限。テンプレート（.potx/.thmx）は数百、500 枚規模のデッキでも数千で収まる
const MAX_ENTRIES: usize = 8_192;
/// 1 part の展開後サイズ上限。theme / master / presentation XML は実測で数十 KB〜数百 KB
const MAX_PART_SIZE: u64 = 8 * 1024 * 1024;

/// part 名の長さ上限（OPC 仕様の実用範囲を大きく超えるものは壊れているとみなす）
const MAX_PART_NAME_LEN: usize = 512;

const CONTENT_TYPES_PART: &str = "[Content_Types].xml";

/// theme part（`a:theme`）の content type
pub const CONTENT_TYPE_THEME: &str = "application/vnd.openxmlformats-officedocument.theme+xml";
/// `.thmx` のルート part（`a:themeManager`）の content type
const CONTENT_TYPE_THEME_MANAGER: &str =
  "application/vnd.openxmlformats-officedocument.themeManager+xml";
/// presentation 本体 part の content type（`.pptx` / `.potx` / `.ppsx` とそれぞれのマクロ有効版）
const PRESENTATION_CONTENT_TYPES: [&str; 6] = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml",
  "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
  "application/vnd.ms-powerpoint.template.macroEnabled.main+xml",
  "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml",
];

/// 上限とパス検査を通した OPC パッケージ
pub struct OpcPackage<R: Read + Seek> {
  archive: ZipArchive<R>,
  /// 小文字化した part 名 → zip エントリ名。OPC の part 名は大文字小文字を区別しないため引きは小文字で行う。
  /// `BTreeMap` なので走査順が名前順に決まる（同一入力から同一出力を出すための土台）
  parts: BTreeMap<String, String>,
  content_types: ContentTypes,
}

impl<R: Read + Seek> OpcPackage<R> {
  /// パッケージを開き、エントリ数・サイズ上限とパス検査を通してから `[Content_Types].xml` を読む
  pub fn open(mut reader: R) -> Result<Self, BrandError> {
    let size = reader
      .seek(SeekFrom::End(0))
      .map_err(|e| BrandError::Io(e.to_string()))?;
    if size > MAX_ARCHIVE_SIZE {
      return Err(BrandError::TooLarge(format!(
        "ファイルサイズが上限（{MAX_ARCHIVE_SIZE} バイト）を超えています"
      )));
    }
    reader.rewind().map_err(|e| BrandError::Io(e.to_string()))?;

    let mut archive = ZipArchive::new(reader).map_err(|e| BrandError::Archive(e.to_string()))?;
    if archive.len() > MAX_ENTRIES {
      return Err(BrandError::TooLarge(format!(
        "エントリ数が上限（{MAX_ENTRIES}）を超えています"
      )));
    }

    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
      // 展開はしないので by_index_raw で伸長器を用意させない
      let entry = archive
        .by_index_raw(index)
        .map_err(|e| BrandError::Archive(e.to_string()))?;
      if entry.is_dir() {
        continue;
      }
      let name = entry.name().to_string();
      if !is_safe_part_name(&name) {
        return Err(BrandError::UnsafePath(name));
      }
      parts.insert(name.to_ascii_lowercase(), name);
    }

    let content_types =
      ContentTypes::parse(&read_part_text(&mut archive, &parts, CONTENT_TYPES_PART)?)?;
    Ok(Self {
      archive,
      parts,
      content_types,
    })
  }

  /// part が存在するか
  pub fn has_part(&self, part: &str) -> bool {
    self.parts.contains_key(&part.to_ascii_lowercase())
  }

  /// part の content type（Override → 拡張子の Default の順に引く）
  pub fn content_type(&self, part: &str) -> Option<&str> {
    self.content_types.of(part)
  }

  /// 指定 content type の part を名前順に返す
  pub fn parts_with_content_type(&self, content_type: &str) -> Vec<String> {
    self
      .parts
      .values()
      .filter(|name| self.content_type(name) == Some(content_type))
      .cloned()
      .collect()
  }

  /// part を UTF-8 文字列として読む
  pub fn read_text(&mut self, part: &str) -> Result<String, BrandError> {
    read_part_text(&mut self.archive, &self.parts, part)
  }

  /// part の関係（`_rels`）を読む。関係ファイルを持たない part は空を返す（末端 part では正常）
  pub fn relationships(&mut self, part: &str) -> Result<Vec<Relationship>, BrandError> {
    let rels_part = rels_part_name(part);
    if !self.has_part(&rels_part) {
      return Ok(Vec::new());
    }
    let xml = self.read_text(&rels_part)?;
    parse_relationships(&xml, base_dir(part))
  }

  /// theme part と slideMaster part を解決する（3 形式で共通の 1 経路）
  pub fn locate_brand_parts(&mut self) -> Result<BrandParts, BrandError> {
    let root_rels = self.relationships("")?;
    let mut theme = None;
    let mut presentation = None;

    if let Some(root) = find_target(&root_rels, "officeDocument") {
      match self.content_type(&root).map(str::to_string) {
        // .thmx: officeDocument は themeManager を指し、theme と presentation はその rels から辿れる
        Some(ct) if ct == CONTENT_TYPE_THEME_MANAGER => {
          let rels = self.relationships(&root)?;
          theme = find_target(&rels, "theme");
          presentation = find_target(&rels, "officeDocument");
        }
        // .pptx / .potx: officeDocument が presentation 本体
        Some(ct) if PRESENTATION_CONTENT_TYPES.contains(&ct.as_str()) => presentation = Some(root),
        _ => {}
      }
    }

    let slide_master = match presentation {
      Some(part) => self.resolve_first_slide_master(&part)?,
      None => None,
    };

    if theme.is_none() {
      if let Some(master) = &slide_master {
        theme = find_target(&self.relationships(master)?, "theme");
      }
    }

    // 関係を辿れない（rels が壊れている・未知の派生形式）場合は content type 検索の名前順先頭へ落とす。
    // 実物では本体テーマが名前順で先に来る（.thmx: `theme/…` < `themeVariants/…`、.pptx: `theme1.xml` < `theme2.xml`）
    let theme = theme
      .filter(|part| self.has_part(part))
      .or_else(|| {
        self
          .parts_with_content_type(CONTENT_TYPE_THEME)
          .into_iter()
          .next()
      })
      .ok_or_else(|| BrandError::MissingPart("theme part（テーマ定義）".to_string()))?;

    Ok(BrandParts {
      theme,
      slide_master: slide_master.filter(|part| self.has_part(part)),
    })
  }

  /// `p:sldMasterIdLst` 先頭の `r:id` から slideMaster part を引く。
  /// 記述順の先頭が「1 枚目のマスター」であり、`rId` の番号順とは一致しないため XML の順序を使う
  fn resolve_first_slide_master(
    &mut self,
    presentation: &str,
  ) -> Result<Option<String>, BrandError> {
    let rels = self.relationships(presentation)?;
    let xml = self.read_text(presentation)?;
    if let Some(id) = first_slide_master_rel_id(&xml)? {
      if let Some(found) = rels.iter().find(|r| r.id == id) {
        return Ok(Some(found.target.clone()));
      }
    }
    // sldMasterIdLst が無い/読めない場合は slideMaster 関係の名前順先頭へ落とす
    let mut targets: Vec<String> = rels
      .iter()
      .filter(|r| r.kind == "slideMaster")
      .map(|r| r.target.clone())
      .collect();
    targets.sort();
    Ok(targets.into_iter().next())
  }
}

/// 抽出対象の part
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrandParts {
  pub theme: String,
  /// theme 単体のパッケージでは存在しない（clrMap は標準写像で代替する）
  pub slide_master: Option<String>,
}

/// `_rels` の 1 エントリ
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relationship {
  pub id: String,
  /// 関係タイプ URI の末尾セグメント（`officeDocument` / `slideMaster` / `theme` 等）
  pub kind: String,
  /// パッケージルートからの part 名（先頭 `/` なし・`..` 解決済み）
  pub target: String,
}

/// zip エントリ名が OPC の part 名として妥当かを判定する。
/// このリーダはディスクへ書き出さないが、絶対パス・`..`・NUL を含むアーカイブは壊れているか悪意があるかの
/// どちらかなので受け付けない（`zip` クレートの実装差に依存せず、全プラットフォームで同じ判定にする）
fn is_safe_part_name(name: &str) -> bool {
  if name.is_empty() || name.len() > MAX_PART_NAME_LEN || name.contains('\0') {
    return false;
  }
  if name.starts_with('/') || name.starts_with('\\') {
    return false;
  }
  // Windows のドライブ指定（`C:/…`）
  if name.as_bytes().get(1) == Some(&b':') {
    return false;
  }
  // zip 仕様の区切りは `/` だが `\` を書く実装があるため両方で分解して検査する
  name
    .split(['/', '\\'])
    .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

/// part を UTF-8 文字列として読む（`OpcPackage::open` の途中でも使うため自由関数にしている）
fn read_part_text<R: Read + Seek>(
  archive: &mut ZipArchive<R>,
  parts: &BTreeMap<String, String>,
  part: &str,
) -> Result<String, BrandError> {
  let name = parts
    .get(&part.to_ascii_lowercase())
    .ok_or_else(|| BrandError::MissingPart(part.to_string()))?;
  let mut entry = archive
    .by_name(name)
    .map_err(|e| BrandError::Archive(e.to_string()))?;
  if entry.size() > MAX_PART_SIZE {
    return Err(BrandError::TooLarge(format!(
      "{part} の展開後サイズが上限（{MAX_PART_SIZE} バイト）を超えています"
    )));
  }
  // 宣言サイズを信用せず take でも打ち切る（宣言と実体が食い違う zip bomb への二重の歯止め）
  let mut bytes = Vec::new();
  entry
    .by_ref()
    .take(MAX_PART_SIZE + 1)
    .read_to_end(&mut bytes)
    .map_err(|e| BrandError::Io(e.to_string()))?;
  if bytes.len() as u64 > MAX_PART_SIZE {
    return Err(BrandError::TooLarge(format!(
      "{part} の展開後サイズが上限（{MAX_PART_SIZE} バイト）を超えています"
    )));
  }
  String::from_utf8(bytes).map_err(|_| BrandError::Xml(format!("{part} が UTF-8 ではありません")))
}

/// part の関係ファイル名（`ppt/presentation.xml` → `ppt/_rels/presentation.xml.rels`、ルート（空文字列）→ `_rels/.rels`）
fn rels_part_name(part: &str) -> String {
  if part.is_empty() {
    return "_rels/.rels".to_string();
  }
  match part.rsplit_once('/') {
    Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
    None => format!("_rels/{part}.rels"),
  }
}

/// part が属するディレクトリ（相対 Target の基準）
fn base_dir(part: &str) -> &str {
  part.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("")
}

/// 指定種別の関係の Target を記述順の先頭から返す
fn find_target(relationships: &[Relationship], kind: &str) -> Option<String> {
  relationships
    .iter()
    .find(|r| r.kind == kind)
    .map(|r| r.target.clone())
}

/// rels の `Target` をパッケージルートからの part 名へ解決する。
/// 先頭 `/` はルート指定、`../` は畳む。ルートより上へ出る Target は不正として `None`（パス検査）
fn resolve_target(base_dir: &str, target: &str) -> Option<String> {
  let combined = match target.strip_prefix('/') {
    Some(absolute) => absolute.to_string(),
    None if base_dir.is_empty() => target.to_string(),
    None => format!("{base_dir}/{target}"),
  };
  let mut segments: Vec<&str> = Vec::new();
  for segment in combined.split('/') {
    match segment {
      "" | "." => {}
      ".." => {
        segments.pop()?;
      }
      other => segments.push(other),
    }
  }
  if segments.is_empty() {
    return None;
  }
  Some(segments.join("/"))
}

/// `_rels` の XML をパースする。外部参照（`TargetMode="External"`）は part ではないので落とす
fn parse_relationships(xml: &str, base_dir: &str) -> Result<Vec<Relationship>, BrandError> {
  let mut out = Vec::new();
  let mut reader = Reader::from_str(xml);
  reader.config_mut().trim_text(true);
  loop {
    match reader.read_event() {
      Ok(Event::Eof) => break,
      Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
        if local_name(e.name()) != "Relationship" {
          continue;
        }
        if attr(&e, "TargetMode").as_deref() == Some("External") {
          continue;
        }
        let (Some(id), Some(type_uri), Some(target)) =
          (attr(&e, "Id"), attr(&e, "Type"), attr(&e, "Target"))
        else {
          continue;
        };
        let Some(resolved) = resolve_target(base_dir, &target) else {
          continue;
        };
        out.push(Relationship {
          id,
          kind: type_uri.rsplit('/').next().unwrap_or_default().to_string(),
          target: resolved,
        });
      }
      Ok(_) => {}
      Err(e) => return Err(BrandError::Xml(e.to_string())),
    }
  }
  Ok(out)
}

/// presentation XML の `p:sldMasterIdLst` 先頭 `p:sldMasterId` の `r:id` を返す
fn first_slide_master_rel_id(xml: &str) -> Result<Option<String>, BrandError> {
  let mut reader = Reader::from_str(xml);
  reader.config_mut().trim_text(true);
  let mut in_list = false;
  loop {
    match reader.read_event() {
      Ok(Event::Eof) => break,
      Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local_name(e.name()).as_str() {
        "sldMasterIdLst" => in_list = true,
        "sldMasterId" if in_list => {
          if let Some(id) = relationship_id(&e) {
            return Ok(Some(id));
          }
        }
        _ => {}
      },
      Ok(Event::End(e)) => {
        if local_name(e.name()) == "sldMasterIdLst" {
          break;
        }
      }
      Ok(_) => {}
      Err(e) => return Err(BrandError::Xml(e.to_string())),
    }
  }
  Ok(None)
}

/// `r:id` 属性を読む。`p:sldMasterId` は名前空間なしの `id`（数値）も持つため、
/// ローカル名だけで引くと取り違える。接頭辞つきの `id` に限定して引く
fn relationship_id(e: &BytesStart) -> Option<String> {
  e.attributes()
    .flatten()
    .find(|a| a.key.as_ref().ends_with(b":id"))
    .and_then(|a| a.normalized_value(super::XML_VERSION).ok())
    .map(|value| value.into_owned())
}

/// `[Content_Types].xml`。OPC は「拡張子の既定」と「part 個別の上書き」の 2 段で part の種類を決める
#[derive(Debug, Default)]
struct ContentTypes {
  /// 拡張子（小文字）→ content type
  defaults: BTreeMap<String, String>,
  /// part 名（小文字・先頭 `/` なし）→ content type
  overrides: BTreeMap<String, String>,
}

impl ContentTypes {
  fn parse(xml: &str) -> Result<Self, BrandError> {
    let mut out = Self::default();
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    loop {
      match reader.read_event() {
        Ok(Event::Eof) => break,
        Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
          let Some(content_type) = attr(&e, "ContentType") else {
            continue;
          };
          let content_type = content_type.trim().to_string();
          match local_name(e.name()).as_str() {
            "Default" => {
              if let Some(extension) = attr(&e, "Extension") {
                out
                  .defaults
                  .insert(extension.trim().to_ascii_lowercase(), content_type);
              }
            }
            "Override" => {
              if let Some(part) = attr(&e, "PartName") {
                let key = part.trim().trim_start_matches('/').to_ascii_lowercase();
                out.overrides.insert(key, content_type);
              }
            }
            _ => {}
          }
        }
        Ok(_) => {}
        Err(e) => return Err(BrandError::Xml(e.to_string())),
      }
    }
    Ok(out)
  }

  fn of(&self, part: &str) -> Option<&str> {
    let lower = part.to_ascii_lowercase();
    if let Some(content_type) = self.overrides.get(&lower) {
      return Some(content_type);
    }
    let extension = lower.rsplit_once('.').map(|(_, ext)| ext)?;
    self.defaults.get(extension).map(String::as_str)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_unsafe_part_names() {
    assert!(is_safe_part_name("ppt/theme/theme1.xml"));
    assert!(is_safe_part_name("[Content_Types].xml"));
    assert!(!is_safe_part_name(""));
    assert!(!is_safe_part_name("/etc/passwd"));
    assert!(!is_safe_part_name("\\\\server\\share"));
    assert!(!is_safe_part_name("C:/Windows/system32"));
    assert!(!is_safe_part_name("../../etc/passwd"));
    assert!(!is_safe_part_name("ppt/../../escape.xml"));
    assert!(!is_safe_part_name("ppt\\..\\escape.xml"));
    assert!(!is_safe_part_name("ppt//theme.xml"));
    assert!(!is_safe_part_name("ppt/./theme.xml"));
    assert!(!is_safe_part_name("a\0b.xml"));
    assert!(!is_safe_part_name(&"a".repeat(MAX_PART_NAME_LEN + 1)));
  }

  #[test]
  fn rels_part_name_follows_opc_convention() {
    assert_eq!(rels_part_name(""), "_rels/.rels");
    assert_eq!(
      rels_part_name("ppt/presentation.xml"),
      "ppt/_rels/presentation.xml.rels"
    );
    assert_eq!(
      rels_part_name("ppt/slideMasters/slideMaster1.xml"),
      "ppt/slideMasters/_rels/slideMaster1.xml.rels"
    );
    assert_eq!(
      rels_part_name("presentation.xml"),
      "_rels/presentation.xml.rels"
    );
  }

  #[test]
  fn resolve_target_handles_relative_absolute_and_escapes() {
    assert_eq!(
      resolve_target("ppt", "theme/theme1.xml").as_deref(),
      Some("ppt/theme/theme1.xml")
    );
    assert_eq!(
      resolve_target("ppt/slideMasters", "../theme/theme1.xml").as_deref(),
      Some("ppt/theme/theme1.xml")
    );
    // 先頭 `/` はパッケージルート指定（実物の .thmx が themeVariants をこの形で書く）
    assert_eq!(
      resolve_target("theme/theme", "/themeVariants/themeVariantManager.xml").as_deref(),
      Some("themeVariants/themeVariantManager.xml")
    );
    assert_eq!(
      resolve_target("", "ppt/presentation.xml").as_deref(),
      Some("ppt/presentation.xml")
    );
    // ルートより上へ出る Target は受け付けない
    assert_eq!(resolve_target("ppt", "../../etc/passwd"), None);
    assert_eq!(resolve_target("", ".."), None);
  }

  #[test]
  fn content_types_resolves_override_then_default() {
    let xml = r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="XML" ContentType="application/xml"/>
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
    </Types>"#;
    let types = ContentTypes::parse(xml).unwrap();
    assert_eq!(types.of("ppt/theme/theme1.xml"), Some(CONTENT_TYPE_THEME));
    // Override が無い part は拡張子の Default に落ちる（拡張子の大小は区別しない）
    assert_eq!(types.of("ppt/presentation.xml"), Some("application/xml"));
    assert_eq!(
      types.of("ppt/_rels/presentation.xml.rels"),
      Some("application/vnd.openxmlformats-package.relationships+xml")
    );
    assert_eq!(types.of("media/image1.png"), None);
  }

  #[test]
  fn parse_relationships_resolves_targets_and_drops_external() {
    let xml = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
      <Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
      <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/>
    </Relationships>"#;
    let rels = parse_relationships(xml, "ppt/slideMasters").unwrap();
    assert_eq!(rels.len(), 2);
    assert_eq!(
      find_target(&rels, "theme").as_deref(),
      Some("ppt/theme/theme1.xml")
    );
    assert_eq!(rels[0].kind, "slideLayout");
    // 外部参照は part ではないので落ちている
    assert!(rels.iter().all(|r| r.kind != "hyperlink"));
  }

  #[test]
  fn first_slide_master_rel_id_prefers_prefixed_id() {
    // p:sldMasterId は名前空間なしの id（数値）も持つため、r:id と取り違えないこと
    let xml = r#"<p:presentation xmlns:p="p" xmlns:r="r">
      <p:sldMasterIdLst>
        <p:sldMasterId id="2147483696" r:id="rId1"/>
        <p:sldMasterId id="2147483697" r:id="rId2"/>
      </p:sldMasterIdLst>
    </p:presentation>"#;
    assert_eq!(
      first_slide_master_rel_id(xml).unwrap().as_deref(),
      Some("rId1")
    );
    // 一覧が無い場合は None（呼び出し側が slideMaster 関係の名前順先頭へ落とす）
    assert_eq!(
      first_slide_master_rel_id("<p:presentation xmlns:p=\"p\"/>").unwrap(),
      None
    );
  }
}
