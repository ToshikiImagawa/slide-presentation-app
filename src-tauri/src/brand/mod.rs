//! 配布された OOXML テンプレート（`.pptx` / `.potx` / `.thmx`）からブランド情報を抽出する（#167 / #168）。
//!
//! 目視転写では構造的に落ちる情報（`p:clrMap` の `bg1`/`tx1` 割当、`a:font script="Jpan"` の和文書体、
//! `p:txStyles/…/a:defRPr@sz` の実 pt）を XML として読む。バイナリ読取は権限方針上 Rust 側に閉じる。
//!
//! - 12 キー・書体名・pt は決定的抽出（#167）。同一入力から必ず同一出力になる
//!   （ネットワーク・時刻・乱数・`HashMap` の走査順に依存しない）。
//! - ロゴ候補・帯候補（`logo_candidates` / `band_candidates`）はヒューリスティクス（#168）の出力で、
//!   誤爆しうる前提の**候補**にすぎない。採否・上書きは並置比較ダイアログで人が決める（自動確定しない）。
//! - 出力は宣言的データ（12 キーの色・書体名・pt・候補の幾何と画像バイト列）のみで、
//!   **生成 CSS 文字列は含めない**（Epic #173 の方針）。受け皿（`ThemeData` の `colors` / `fonts` / `tokens` /
//!   `masters`）へ写すのは呼び出し側（フロントの `compile()`）の責務。

use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::path::Path;

mod color;
mod heuristics;
mod master_xml;
mod opc;
mod shapes;
mod theme_xml;
mod xml;

use color::{apply_transforms, ColorRef, ColorSpec, Rgb};
use master_xml::{ClrMap, MasterInfo};
use opc::{OpcPackage, SlideSize};
use theme_xml::{ClrScheme, FontScheme};

/// 抽出エラー。UI へは `to_string()` で返すため、内部パス等を含めない
#[derive(Debug)]
pub enum BrandError {
  /// ファイルが開けない・読めない
  Io(String),
  /// zip として壊れている（暗号化・非対応の圧縮方式を含む）
  Archive(String),
  /// 上限（ファイルサイズ / エントリ数 / part サイズ）を超えた
  TooLarge(String),
  /// zip エントリ名が part 名として不正（絶対パス・`..` 等）
  UnsafePath(String),
  /// 必須の part が無い
  MissingPart(String),
  /// XML として壊れている
  Xml(String),
}

impl std::fmt::Display for BrandError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      BrandError::Io(msg) => write!(f, "テンプレートを読み込めません: {msg}"),
      BrandError::Archive(msg) => write!(f, "テンプレートの形式が不正です: {msg}"),
      BrandError::TooLarge(msg) => write!(f, "テンプレートが大きすぎます: {msg}"),
      BrandError::UnsafePath(name) => write!(
        f,
        "テンプレートに不正なパスのエントリが含まれています: {name}"
      ),
      BrandError::MissingPart(part) => write!(f, "テンプレートに必要な要素がありません: {part}"),
      BrandError::Xml(msg) => write!(f, "テンプレートの XML が不正です: {msg}"),
    }
  }
}

impl std::error::Error for BrandError {}

/// `p:clrMap` を適用した 12 キーの色。受け皿（`theme/<slug>.json` の 12 キー）が実際に使う値
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedColors {
  pub bg1: Option<Rgb>,
  pub tx1: Option<Rgb>,
  pub bg2: Option<Rgb>,
  pub tx2: Option<Rgb>,
  pub accent1: Option<Rgb>,
  pub accent2: Option<Rgb>,
  pub accent3: Option<Rgb>,
  pub accent4: Option<Rgb>,
  pub accent5: Option<Rgb>,
  pub accent6: Option<Rgb>,
  pub hlink: Option<Rgb>,
  pub fol_hlink: Option<Rgb>,
}

/// `p:txStyles` の第 1 レベル既定を解決した値
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyle {
  /// 実 pt（`a:defRPr@sz` の 1/100pt を換算）
  pub size_pt: Option<f64>,
  /// 解決済みの文字色
  pub color: Option<Rgb>,
}

/// マスターの既定テキストスタイル
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyles {
  pub title: TextStyle,
  pub body: TextStyle,
  pub other: TextStyle,
}

/// base64 / 画像バイト列（サムネイル・ロゴ候補）。IPC は JSON なので生バイト列は載せられない
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
  pub content_type: String,
  pub base64: String,
}

/// ロゴ候補（#168 のヒューリスティクス出力）。並置比較ダイアログで人が選ぶ・上書きする前提の**候補**であり、
/// 自動確定はしない
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoCandidate {
  /// `p:cNvPr@name`（"Company Logo" 等）。ランキングの name hint にも使った値をそのまま見せる
  pub name_hint: Option<String>,
  pub image: MediaAsset,
  pub width_emu: i64,
  pub height_emu: i64,
  pub x_emu: i64,
  pub y_emu: i64,
}

/// 帯候補（#168 のヒューリスティクス出力）。`anchor`/`orientation` はフロントの
/// `BandMasterDecoration`（`src/data/types.ts`）とそのまま対応する
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandCandidate {
  pub orientation: String,
  pub anchor: String,
  pub color_hex: String,
  pub thickness_emu: i64,
}

/// 決定的抽出の結果。色はすべて `#rrggbb` に確定済み。ロゴ・帯候補はヒューリスティクスの出力であり、
/// 誤爆しうる前提の**候補**（採否は #168 の確認ダイアログで人が決める）
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandProfile {
  /// `a:theme@name`（テンプレート名）
  pub name: Option<String>,
  /// 読んだ theme part 名。`.thmx` は theme part をバリアント込みで複数持つため、どれを読んだか示せるようにする
  pub theme_part: String,
  /// 読んだ slideMaster part 名（theme 単体のパッケージでは `null`）
  pub slide_master_part: Option<String>,
  /// テンプレートファイル本体の sha256（hex）。同一テンプレートの再取り込みで人の上書きを引き継ぐキーにする
  pub template_hash: String,
  /// presentation 本体から読んだスライドサイズ（EMU）。ロゴ候補ランキング・帯検出の幾何判定の基準
  pub slide_size: Option<SlideSize>,
  /// パッケージの埋め込みサムネイル（`docProps/thumbnail.jpeg` 等）。並置比較ダイアログの左パネルに使う
  pub thumbnail: Option<MediaAsset>,
  /// ランキング済みのロゴ候補（先頭が最有力）
  pub logo_candidates: Vec<LogoCandidate>,
  /// 検出した帯候補
  pub band_candidates: Vec<BandCandidate>,
  /// `a:clrScheme` の 12 スロット
  pub colors: ClrScheme,
  /// `p:clrMap`（12 キーが clrScheme のどのスロットを指すか）
  pub color_map: ClrMap,
  /// clrMap 適用後の 12 キー
  pub mapped_colors: MappedColors,
  /// `a:fontScheme` の見出し / 本文書体
  pub fonts: FontScheme,
  pub text_styles: TextStyles,
}

/// テンプレートファイルからブランド情報を抽出する。ネットワークアクセスはせず、ディスクへも書き出さない
pub fn extract_brand_profile(path: &Path) -> Result<BrandProfile, BrandError> {
  let file = File::open(path).map_err(|e| BrandError::Io(e.to_string()))?;
  extract(BufReader::new(file))
}

/// リーダから抽出する（テストがメモリ上の zip を渡せるように分けている）
fn extract<R: Read + Seek>(mut reader: R) -> Result<BrandProfile, BrandError> {
  let template_hash = hash_reader(&mut reader)?;
  let mut package = OpcPackage::open(reader)?;
  let parts = package.locate_brand_parts()?;

  let theme = theme_xml::parse(&package.read_text(&parts.theme)?)?;
  // slideMaster が無いパッケージ（theme 単体）は標準の clrMap で代替する
  let master = match &parts.slide_master {
    Some(part) => master_xml::parse(&package.read_text(part)?)?,
    None => MasterInfo::default(),
  };

  let slide_size = match &parts.presentation {
    Some(part) => opc::parse_slide_size(&package.read_text(part)?)?,
    None => None,
  };

  let (logo_candidates, band_candidates) = match (&parts.slide_master, slide_size) {
    (Some(master_part), Some(size)) => {
      let raw = shapes::parse_shapes(&package.read_text(master_part)?)?;
      let logos = heuristics::rank_logo_candidates(&raw.pics, size)
        .into_iter()
        .filter_map(|ranked| resolve_logo_candidate(&mut package, master_part, ranked))
        .collect();
      let bands = heuristics::classify_bands(&raw.shapes, &theme.colors, &master.color_map, size)
        .into_iter()
        .map(|b| BandCandidate {
          orientation: b.orientation.to_string(),
          anchor: b.anchor.to_string(),
          color_hex: b.color.to_hex(),
          thickness_emu: b.thickness_emu,
        })
        .collect();
      (logos, bands)
    }
    _ => (Vec::new(), Vec::new()),
  };

  let thumbnail = extract_thumbnail(&mut package);

  Ok(BrandProfile {
    name: theme.name,
    theme_part: parts.theme,
    slide_master_part: parts.slide_master,
    template_hash,
    slide_size,
    thumbnail,
    logo_candidates,
    band_candidates,
    mapped_colors: map_colors(&theme.colors, &master.color_map),
    text_styles: TextStyles {
      title: resolve_text_style(&master.title, &theme.colors, &master.color_map),
      body: resolve_text_style(&master.body, &theme.colors, &master.color_map),
      other: resolve_text_style(&master.other, &theme.colors, &master.color_map),
    },
    colors: theme.colors,
    color_map: master.color_map,
    fonts: theme.fonts,
  })
}

/// テンプレートファイル本体の sha256（hex）。読み終えたら先頭へ戻す（後続の zip オープンに同じ reader を使うため）
fn hash_reader<R: Read + Seek>(reader: &mut R) -> Result<String, BrandError> {
  use sha2::{Digest, Sha256};
  reader.rewind().map_err(|e| BrandError::Io(e.to_string()))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 64 * 1024];
  loop {
    let read = reader
      .read(&mut buf)
      .map_err(|e| BrandError::Io(e.to_string()))?;
    if read == 0 {
      break;
    }
    hasher.update(&buf[..read]);
  }
  reader.rewind().map_err(|e| BrandError::Io(e.to_string()))?;
  Ok(format!("{:x}", hasher.finalize()))
}

/// part を読んで `MediaAsset`（content type + base64）にする。読めない・content type 不明のいずれでも
/// `None`（呼び出し側はその 1 件だけを諦める。1 件の画像事故で並置比較ダイアログ全体を失敗させない）
fn read_media_asset(
  package: &mut OpcPackage<impl Read + Seek>,
  part: &str,
  default_content_type: &str,
) -> Option<MediaAsset> {
  let bytes = package.read_bytes(part).ok()?;
  let content_type = package
    .content_type_of(part)
    .unwrap_or_else(|| default_content_type.to_string());
  Some(MediaAsset {
    content_type,
    base64: encode_base64(&bytes),
  })
}

/// ランキング済みロゴ候補の `r:embed` を media part へ解決し、バイト列を読む。
/// 参照が壊れている場合も、その 1 件だけを諦めて `None` を返す
fn resolve_logo_candidate(
  package: &mut OpcPackage<impl Read + Seek>,
  master_part: &str,
  ranked: heuristics::RankedLogo,
) -> Option<LogoCandidate> {
  let media_part = package
    .resolve_relationship_id(master_part, &ranked.embed_rid)
    .ok()??;
  Some(LogoCandidate {
    name_hint: ranked.name_hint,
    image: read_media_asset(package, &media_part, "application/octet-stream")?,
    width_emu: ranked.width_emu,
    height_emu: ranked.height_emu,
    x_emu: ranked.x_emu,
    y_emu: ranked.y_emu,
  })
}

/// パッケージの埋め込みサムネイル（root の `_rels/.rels` にある `metadata/thumbnail` 関係）。
/// 無い・壊れているテンプレートは多い（自己生成しない編集ソフトもある）ため、無ければ黙って `None`
fn extract_thumbnail(package: &mut OpcPackage<impl Read + Seek>) -> Option<MediaAsset> {
  let part = package.find_relationship_target("", "thumbnail").ok()??;
  read_media_asset(package, &part, "image/jpeg")
}

fn encode_base64(bytes: &[u8]) -> String {
  use base64::engine::general_purpose::STANDARD;
  use base64::Engine as _;
  STANDARD.encode(bytes)
}

/// clrMap を通して 12 キーを確定させる
fn map_colors(scheme: &ClrScheme, map: &ClrMap) -> MappedColors {
  let resolve = |key: &str| scheme.slot(map.resolve(key));
  MappedColors {
    bg1: resolve("bg1"),
    tx1: resolve("tx1"),
    bg2: resolve("bg2"),
    tx2: resolve("tx2"),
    accent1: resolve("accent1"),
    accent2: resolve("accent2"),
    accent3: resolve("accent3"),
    accent4: resolve("accent4"),
    accent5: resolve("accent5"),
    accent6: resolve("accent6"),
    hlink: resolve("hlink"),
    fol_hlink: resolve("folHlink"),
  }
}

fn resolve_text_style(
  raw: &master_xml::RawTextStyle,
  scheme: &ClrScheme,
  map: &ClrMap,
) -> TextStyle {
  TextStyle {
    size_pt: raw.size_pt,
    color: raw
      .color
      .as_ref()
      .and_then(|spec| resolve_color_spec(spec, scheme, map)),
  }
}

/// 未解決の色指定を確定色へ解決する。
/// `schemeClr` は clrMap → clrScheme の 2 段で引き、変換（lumMod/lumOff/tint/shade）を出現順に適用する。
/// `heuristics::classify_bands`（帯の塗り解決）からも使うため `pub(super)`
pub(super) fn resolve_color_spec(
  spec: &ColorSpec,
  scheme: &ClrScheme,
  map: &ClrMap,
) -> Option<Rgb> {
  let base = match &spec.base {
    ColorRef::Fixed(rgb) => *rgb,
    ColorRef::Scheme(name) => scheme.slot(map.resolve(name))?,
  };
  Some(apply_transforms(base, &spec.transforms))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{Cursor, Write};
  use zip::write::SimpleFileOptions;
  use zip::{CompressionMethod, ZipWriter};

  const CT_THEME: &str = "application/vnd.openxmlformats-officedocument.theme+xml";
  const CT_THEME_MANAGER: &str = "application/vnd.openxmlformats-officedocument.themeManager+xml";
  const CT_PRESENTATION: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
  const CT_SLIDE_MASTER: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml";
  const REL_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  /// 名前と `accent1` だけを差し替えた 12 スロットの theme part（part を取り違えたら値で分かるようにする）
  fn theme_part(name: &str, accent1: &str) -> String {
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="{name}">
  <a:themeElements>
    <a:clrScheme name="{name}">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent1}"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="{name}">
      <a:majorFont><a:latin typeface="Yu Gothic UI"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック Light"/></a:majorFont>
      <a:minorFont><a:latin typeface="Yu Gothic"/><a:ea typeface="游ゴシック"/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>"#
    )
  }

  /// ダークテーマの写像（bg1=dk1 / tx1=lt1）を持つ slideMaster part
  const MASTER_PART: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr><a:defRPr sz="2000"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>"#;

  const PRESENTATION_PART: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
</p:presentation>"#;

  fn relationships(entries: &[(&str, &str, &str)]) -> String {
    let body: String = entries
      .iter()
      .map(|(id, kind, target)| {
        format!(r#"<Relationship Id="{id}" Type="{REL_NS}/{kind}" Target="{target}"/>"#)
      })
      .collect();
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#
    )
  }

  fn content_types(overrides: &[(&str, &str)]) -> String {
    let body: String = overrides
      .iter()
      .map(|(part, ct)| format!(r#"<Override PartName="{part}" ContentType="{ct}"/>"#))
      .collect();
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{body}</Types>"#
    )
  }

  fn build_zip(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    // Stored 固定にして圧縮方式の feature に依存しないテストにする
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, content) in entries {
      writer.start_file(*name, options).unwrap();
      writer.write_all(content.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
  }

  /// `.pptx` 形（slideMaster は theme2 を指す＝名前順の先頭ではない）のパッケージ
  fn pptx_package() -> Vec<u8> {
    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/ppt/theme/theme2.xml", CT_THEME),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    // 実物と同じく presentation 側にも theme 関係が付く（こちらは decoy を指す）。
    // マスター側の theme が優先されることを固定する
    let pres_rels = relationships(&[
      ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
      ("rId2", "theme", "theme/theme1.xml"),
    ]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme2.xml")]);
    let decoy = theme_part("Decoy", "FF0000");
    let real = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_PART),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_PART),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &decoy),
      ("ppt/theme/theme2.xml", &real),
    ])
  }

  /// `.thmx` 形（officeDocument が themeManager を指し、バリアントの theme part も同梱される）のパッケージ。
  /// 関係の張り方は実物の Office テーマ（`Parcel.thmx` 等）と同じ
  fn thmx_package() -> Vec<u8> {
    let types = content_types(&[
      ("/theme/theme/themeManager.xml", CT_THEME_MANAGER),
      ("/theme/theme/theme1.xml", CT_THEME),
      ("/theme/presentation.xml", CT_PRESENTATION),
      ("/theme/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/themeVariants/variant1/theme/theme/theme1.xml", CT_THEME),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "theme/theme/themeManager.xml")]);
    let manager_rels = relationships(&[
      ("rId1", "theme", "theme1.xml"),
      ("rId5", "officeDocument", "../presentation.xml"),
    ]);
    let pres_rels = relationships(&[("rId1", "slideMaster", "slideMasters/slideMaster1.xml")]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme1.xml")]);
    let real = theme_part("Corporate", "1F4E79");
    let variant = theme_part("Variant", "00FF00");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      (
        "theme/theme/themeManager.xml",
        r#"<a:themeManager xmlns:a="a"/>"#,
      ),
      ("theme/theme/_rels/themeManager.xml.rels", &manager_rels),
      ("theme/theme/theme1.xml", &real),
      ("theme/presentation.xml", PRESENTATION_PART),
      ("theme/_rels/presentation.xml.rels", &pres_rels),
      ("theme/slideMasters/slideMaster1.xml", MASTER_PART),
      (
        "theme/slideMasters/_rels/slideMaster1.xml.rels",
        &master_rels,
      ),
      ("themeVariants/variant1/theme/theme/theme1.xml", &variant),
    ])
  }

  fn extract_bytes(bytes: &[u8]) -> Result<BrandProfile, BrandError> {
    extract(Cursor::new(bytes.to_vec()))
  }

  #[test]
  fn extracts_12_colors_and_fonts_from_pptx_package() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    // 関係を辿って theme2 に到達している（名前順の先頭 theme1 は decoy）
    assert_eq!(profile.theme_part, "ppt/theme/theme2.xml");
    assert_eq!(profile.name.as_deref(), Some("Corporate"));
    assert_eq!(
      profile.slide_master_part.as_deref(),
      Some("ppt/slideMasters/slideMaster1.xml")
    );

    // clrScheme の 12 スロットすべてが確定している
    let hex = |slot: &str| {
      profile
        .colors
        .slot(slot)
        .map(Rgb::to_hex)
        .unwrap_or_default()
    };
    assert_eq!(hex("dk1"), "#000000");
    assert_eq!(hex("lt1"), "#ffffff");
    assert_eq!(hex("dk2"), "#44546a");
    assert_eq!(hex("lt2"), "#e7e6e6");
    assert_eq!(hex("accent1"), "#1f4e79");
    assert_eq!(hex("accent2"), "#ed7d31");
    assert_eq!(hex("accent3"), "#a5a5a5");
    assert_eq!(hex("accent4"), "#ffc000");
    assert_eq!(hex("accent5"), "#5b9bd5");
    assert_eq!(hex("accent6"), "#70ad47");
    assert_eq!(hex("hlink"), "#0563c1");
    assert_eq!(hex("folHlink"), "#954f72");

    // 書体名（ea が空でも script="Jpan" から和文を拾う）
    assert_eq!(profile.fonts.major.latin.as_deref(), Some("Yu Gothic UI"));
    assert_eq!(
      profile.fonts.major.jpan.as_deref(),
      Some("游ゴシック Light")
    );
    assert_eq!(profile.fonts.minor.ea.as_deref(), Some("游ゴシック"));
  }

  #[test]
  fn applies_clr_map_so_dark_templates_are_not_inverted() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    // clrMap が bg1=dk1 / tx1=lt1（ダークテーマ）なので、背景は黒・文字は白になる。
    // 写像を飛ばして bg1=lt1 と決め打ちすると逆になる
    assert_eq!(profile.color_map.bg1, "dk1");
    assert_eq!(
      profile.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
    assert_eq!(
      profile.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    assert_eq!(
      profile.mapped_colors.bg2.map(Rgb::to_hex).as_deref(),
      Some("#44546a")
    );
    assert_eq!(
      profile.mapped_colors.tx2.map(Rgb::to_hex).as_deref(),
      Some("#e7e6e6")
    );
    assert_eq!(
      profile.mapped_colors.accent1.map(Rgb::to_hex).as_deref(),
      Some("#1f4e79")
    );
    assert_eq!(
      profile.mapped_colors.fol_hlink.map(Rgb::to_hex).as_deref(),
      Some("#954f72")
    );
  }

  #[test]
  fn resolves_text_styles_in_points_with_scheme_colors() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    assert_eq!(profile.text_styles.title.size_pt, Some(44.0));
    assert_eq!(profile.text_styles.body.size_pt, Some(20.0));
    assert_eq!(profile.text_styles.other.size_pt, Some(14.0));
    // title の色は schemeClr val="tx1" → clrMap で lt1 → #ffffff
    assert_eq!(
      profile.text_styles.title.color.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    // body は accent1 に lumMod 75% がかかるので原色より暗い
    let body = profile.text_styles.body.color.expect("body color");
    assert_ne!(body.to_hex(), "#1f4e79");
    assert!(body.r <= 0x1f && body.b <= 0x79);
    assert_eq!(profile.text_styles.other.color, None);
  }

  #[test]
  fn extracts_from_thmx_package_without_picking_a_variant() {
    let profile = extract_bytes(&thmx_package()).unwrap();
    // officeDocument → themeManager → theme の経路で本体テーマに到達し、バリアントを掴まない
    assert_eq!(profile.theme_part, "theme/theme/theme1.xml");
    assert_eq!(profile.name.as_deref(), Some("Corporate"));
    assert_eq!(
      profile.colors.accent1.map(Rgb::to_hex).as_deref(),
      Some("#1f4e79")
    );
    // themeManager の officeDocument を辿って slideMaster にも到達している（clrMap が読める）
    assert_eq!(
      profile.slide_master_part.as_deref(),
      Some("theme/slideMasters/slideMaster1.xml")
    );
    assert_eq!(profile.color_map.bg1, "dk1");
  }

  #[test]
  fn falls_back_to_content_type_search_when_relationships_are_missing() {
    // rels を一切持たないパッケージでも content type 検索で theme を引ける（slideMaster は無いので標準写像）
    let types = content_types(&[("/ppt/theme/theme1.xml", CT_THEME)]);
    let theme = theme_part("Bare", "1F4E79");
    let bytes = build_zip(&[
      ("[Content_Types].xml", &types),
      ("ppt/theme/theme1.xml", &theme),
    ]);
    let profile = extract_bytes(&bytes).unwrap();
    assert_eq!(profile.theme_part, "ppt/theme/theme1.xml");
    assert_eq!(profile.slide_master_part, None);
    // 標準写像（bg1=lt1 / tx1=dk1）で 12 キーが確定する
    assert_eq!(profile.color_map.bg1, "lt1");
    assert_eq!(
      profile.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    assert_eq!(
      profile.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
  }

  #[test]
  fn missing_theme_part_is_an_error() {
    let types = content_types(&[]);
    let bytes = build_zip(&[("[Content_Types].xml", &types)]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::MissingPart(_))
    ));
  }

  #[test]
  fn missing_content_types_is_an_error() {
    let bytes = build_zip(&[("ppt/theme/theme1.xml", &theme_part("X", "000000"))]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::MissingPart(_))
    ));
  }

  #[test]
  fn not_a_zip_is_an_error_not_a_panic() {
    assert!(matches!(
      extract_bytes(b"this is not a zip file"),
      Err(BrandError::Archive(_))
    ));
    assert!(matches!(extract_bytes(&[]), Err(BrandError::Archive(_))));
  }

  #[test]
  fn entry_with_unsafe_path_is_rejected() {
    let types = content_types(&[("/ppt/theme/theme1.xml", CT_THEME)]);
    let bytes = build_zip(&[
      ("[Content_Types].xml", &types),
      ("ppt/theme/theme1.xml", &theme_part("X", "000000")),
      ("../../etc/passwd", "root:x:0:0"),
    ]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::UnsafePath(_))
    ));
  }

  #[test]
  fn too_many_entries_is_rejected() {
    let names: Vec<String> = (0..9_000).map(|i| format!("filler/{i}.bin")).collect();
    let entries: Vec<(&str, &str)> = names.iter().map(|name| (name.as_str(), "")).collect();
    let bytes = build_zip(&entries);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::TooLarge(_))
    ));
  }

  #[test]
  fn oversized_part_is_rejected() {
    // 展開後 9MiB の part は上限（8MiB）を超えるので読む前に弾く
    let huge = "a".repeat(9 * 1024 * 1024);
    let bytes = build_zip(&[("[Content_Types].xml", &huge)]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::TooLarge(_))
    ));
  }

  #[test]
  fn extraction_is_deterministic() {
    // 同一入力から必ず同一出力になる（受け入れ基準の再現性）
    let bytes = pptx_package();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }

  #[test]
  fn template_hash_is_deterministic_and_input_sensitive() {
    let bytes = pptx_package();
    let hash = extract_bytes(&bytes).unwrap().template_hash;
    assert_eq!(hash.len(), 64);
    assert!(hash.bytes().all(|b| b.is_ascii_hexdigit()));
    assert_eq!(extract_bytes(&bytes).unwrap().template_hash, hash);
    // 中身が違う（decoy の accent1 が違う）テンプレートは別ハッシュになる
    assert_ne!(extract_bytes(&thmx_package()).unwrap().template_hash, hash);
  }

  /// presentation の `p:sldSz`・slideMaster の spTree（帯・ロゴ）・root のサムネイル関係を持つパッケージ（#168）
  fn pptx_package_with_shapes_and_thumbnail() -> Vec<u8> {
    const PRESENTATION_WITH_SIZE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>"#;
    const MASTER_WITH_SHAPES: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Top Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="457200"/></a:xfrm>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="4" name="Company Logo"/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="10500000" y="6400000"/><a:ext cx="900000" cy="300000"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>"#;

    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/docProps/thumbnail.jpeg", "image/jpeg"),
      ("/ppt/media/image1.png", "image/png"),
    ]);
    let root_rels = relationships(&[
      ("rId1", "officeDocument", "ppt/presentation.xml"),
      ("rId2", "metadata/thumbnail", "docProps/thumbnail.jpeg"),
    ]);
    let pres_rels = relationships(&[("rId1", "slideMaster", "slideMasters/slideMaster1.xml")]);
    let master_rels = relationships(&[
      ("rId12", "theme", "../theme/theme1.xml"),
      ("rId9", "image", "../media/image1.png"),
    ]);
    let theme = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_WITH_SIZE),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_WITH_SHAPES),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &theme),
      ("ppt/media/image1.png", "fake-logo-bytes"),
      ("docProps/thumbnail.jpeg", "fake-thumbnail-bytes"),
    ])
  }

  #[test]
  fn extracts_slide_size_from_presentation() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(
      profile.slide_size,
      Some(SlideSize {
        width_emu: 12_192_000,
        height_emu: 6_858_000
      })
    );
  }

  #[test]
  fn extracts_thumbnail_via_root_relationship() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    let thumbnail = profile.thumbnail.expect("thumbnail");
    assert_eq!(thumbnail.content_type, "image/jpeg");
    use base64::Engine as _;
    assert_eq!(
      base64::engine::general_purpose::STANDARD
        .decode(&thumbnail.base64)
        .unwrap(),
      b"fake-thumbnail-bytes"
    );
  }

  #[test]
  fn extracts_and_ranks_logo_candidate_with_resolved_image_bytes() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(profile.logo_candidates.len(), 1);
    let logo = &profile.logo_candidates[0];
    assert_eq!(logo.name_hint.as_deref(), Some("Company Logo"));
    assert_eq!(logo.width_emu, 900_000);
    assert_eq!(logo.height_emu, 300_000);
    assert_eq!(logo.image.content_type, "image/png");
    use base64::Engine as _;
    assert_eq!(
      base64::engine::general_purpose::STANDARD
        .decode(&logo.image.base64)
        .unwrap(),
      b"fake-logo-bytes"
    );
  }

  #[test]
  fn detects_top_band_candidate_from_master_shapes() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(profile.band_candidates.len(), 1);
    let band = &profile.band_candidates[0];
    assert_eq!(band.orientation, "horizontal");
    assert_eq!(band.anchor, "top-center");
    assert_eq!(band.color_hex, "#1f4e79");
    assert_eq!(band.thickness_emu, 457_200);
  }

  #[test]
  fn shapes_and_thumbnail_extraction_is_deterministic() {
    let bytes = pptx_package_with_shapes_and_thumbnail();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }

  #[test]
  fn serialized_profile_uses_camel_case_and_hex_colors() {
    let json = serde_json::to_value(extract_bytes(&pptx_package()).unwrap()).unwrap();
    assert_eq!(json["themePart"], "ppt/theme/theme2.xml");
    assert_eq!(json["mappedColors"]["folHlink"], "#954f72");
    assert_eq!(json["colors"]["accent1"], "#1f4e79");
    assert_eq!(json["colorMap"]["bg1"], "dk1");
    assert_eq!(json["textStyles"]["title"]["sizePt"], 44.0);
    assert_eq!(json["fonts"]["major"]["jpan"], "游ゴシック Light");
    // 生成 CSS 文字列は出力しない（Epic #173 の方針）
    assert!(!serde_json::to_string(&json).unwrap().contains("--theme-"));
  }

  /// 実テンプレートからの抽出を確認する（実ファイルは fixture としてリポジトリに置けないため CI では走らせない）。
  ///
  /// ```sh
  /// BRAND_SAMPLE="/Applications/Microsoft PowerPoint.app/Contents/Resources/Office Themes/Parcel.thmx" \
  ///   cargo test --manifest-path src-tauri/Cargo.toml brand::tests::real_template -- --ignored --nocapture
  /// ```
  #[test]
  #[ignore = "BRAND_SAMPLE で実ファイル（.pptx/.potx/.thmx）のパスを渡したときだけ実行する"]
  fn real_template_extraction_is_reproducible() {
    let path = std::env::var("BRAND_SAMPLE")
      .expect("BRAND_SAMPLE に .pptx / .potx / .thmx のパスを指定してください");
    let profile = extract_brand_profile(Path::new(&path)).expect("抽出に失敗しました");
    println!("{}", serde_json::to_string_pretty(&profile).unwrap());

    // 12 キーすべてが解決できていること。キー名を手で並べず serde 出力を走査するので、
    // MappedColors を増減してもこの検証が静かに 11 キー検証へ劣化しない
    let mapped = serde_json::to_value(&profile.mapped_colors).unwrap();
    let mapped = mapped.as_object().expect("mappedColors はオブジェクト");
    assert_eq!(mapped.len(), 12, "12 キーそろっていません");
    for (key, value) in mapped {
      assert!(!value.is_null(), "{key} が解決できていません");
    }
    assert!(
      profile.fonts.major.latin.is_some()
        || profile.fonts.major.jpan.is_some()
        || profile.fonts.major.ea.is_some(),
      "見出し書体が取れていません"
    );

    // 再現性: 2 回読んで同一出力
    let again = extract_brand_profile(Path::new(&path)).unwrap();
    assert_eq!(
      serde_json::to_string(&again).unwrap(),
      serde_json::to_string(&profile).unwrap()
    );
  }
}
