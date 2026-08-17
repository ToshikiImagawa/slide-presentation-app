//! slideMaster part（`p:sldMaster` = slideMaster1.xml）のパーサ（#167）。
//!
//! 取るのは `p:clrMap` と `p:txStyles` の第 1 レベル既定だけ。
//!
//! - `p:clrMap` は `bg1`/`tx1`/`bg2`/`tx2` が clrScheme のどのスロットを指すかの写像で、
//!   テンプレートによって `bg1="lt1"` と `bg1="dk1"` が入れ替わる（ダークテーマ）。写像を飛ばすと背景と文字色が反転する。
//! - `p:txStyles/…/a:lvl1pPr/a:defRPr@sz` は 1/100pt 単位の実サイズ。目視では比率しか分からない情報。
//! - 同じ `a:defRPr` の書体・太字・文字色も読む（#316）。slideLayout のプレースホルダが省略した項目の
//!   継承元になる（`text_props::resolve`）。`+mj-lt` 等のテーマ参照は書体名として取り込まない。

use quick_xml::events::BytesStart;

use super::shapes::{is_xfrm_path, read_xfrm_child, PlaceholderShapeTracker, RawXfrm};
use super::text_props::RawTextProps;
use super::xml::{attr, rel, walk_elements};
use super::BrandError;

/// `p:clrMap` の 12 キー。値は clrScheme のスロット名（`lt1` / `dk1` / `accent1` …）
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClrMap {
  pub bg1: String,
  pub tx1: String,
  pub bg2: String,
  pub tx2: String,
  pub accent1: String,
  pub accent2: String,
  pub accent3: String,
  pub accent4: String,
  pub accent5: String,
  pub accent6: String,
  pub hlink: String,
  pub fol_hlink: String,
}

impl Default for ClrMap {
  /// PowerPoint の標準写像。slideMaster を持たないパッケージ（theme 単体）でもこの写像で 12 キーを確定させる
  fn default() -> Self {
    Self {
      bg1: "lt1".to_string(),
      tx1: "dk1".to_string(),
      bg2: "lt2".to_string(),
      tx2: "dk2".to_string(),
      accent1: "accent1".to_string(),
      accent2: "accent2".to_string(),
      accent3: "accent3".to_string(),
      accent4: "accent4".to_string(),
      accent5: "accent5".to_string(),
      accent6: "accent6".to_string(),
      hlink: "hlink".to_string(),
      fol_hlink: "folHlink".to_string(),
    }
  }
}

impl ClrMap {
  /// `a:schemeClr@val` の名前を clrScheme のスロット名へ写す。
  /// `dk1`/`lt1` のように既にスロット名であるものは写像を通さずそのまま返す
  pub fn resolve<'a>(&'a self, name: &'a str) -> &'a str {
    match name {
      "bg1" => &self.bg1,
      "tx1" => &self.tx1,
      "bg2" => &self.bg2,
      "tx2" => &self.tx2,
      "accent1" => &self.accent1,
      "accent2" => &self.accent2,
      "accent3" => &self.accent3,
      "accent4" => &self.accent4,
      "accent5" => &self.accent5,
      "accent6" => &self.accent6,
      "hlink" => &self.hlink,
      "folHlink" => &self.fol_hlink,
      other => other,
    }
  }

  /// `p:clrMap` の属性を読み込む。欠けている属性は標準写像のままにする。
  /// `p:clrMapOvr/p:overrideClrMapping`（layout 単位の反転。#300）も同じ12属性の形のため、
  /// `layout_xml.rs` から `pub(super)` で共有する
  pub(super) fn read_attributes(&mut self, e: &BytesStart) {
    let apply = |key: &str, target: &mut String| {
      if let Some(value) = attr(e, key).filter(|v| !v.is_empty()) {
        *target = value;
      }
    };
    apply("bg1", &mut self.bg1);
    apply("tx1", &mut self.tx1);
    apply("bg2", &mut self.bg2);
    apply("tx2", &mut self.tx2);
    apply("accent1", &mut self.accent1);
    apply("accent2", &mut self.accent2);
    apply("accent3", &mut self.accent3);
    apply("accent4", &mut self.accent4);
    apply("accent5", &mut self.accent5);
    apply("accent6", &mut self.accent6);
    apply("hlink", &mut self.hlink);
    apply("folHlink", &mut self.fol_hlink);
  }
}

/// slideMaster 自身の `p:cSld/p:spTree` にあるプレースホルダの矩形（#317）。layout のプレースホルダが
/// `a:xfrm` を持たない場合の継承元になる。`ph_type`/`idx` は layout 側の値と対応付けるための手がかりで、
/// 継承先の選定（idx 優先・無ければ種別）は呼び出し側（`mod.rs`）に委ねる
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MasterPlaceholderXfrm {
  pub ph_type: Option<String>,
  pub idx: Option<u32>,
  pub xfrm: RawXfrm,
}

/// slideMaster から抽出した内容。`p:txStyles` の第 1 レベル既定（`a:lvl1pPr/a:defRPr`）は
/// slideLayout のプレースホルダと同じ `RawTextProps`（#316）で持つ: 継承の解決（プレースホルダ →
/// `p:txStyles` → `a:fontScheme`）で両者を同じ形として扱えるようにする
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MasterInfo {
  pub color_map: ClrMap,
  /// `p:titleStyle`
  pub title: RawTextProps,
  /// `p:bodyStyle`
  pub body: RawTextProps,
  /// `p:otherStyle`
  pub other: RawTextProps,
  /// `p:cSld/p:spTree` 配下のプレースホルダの矩形（#317。列挙順は XML の記述順）
  pub placeholders: Vec<MasterPlaceholderXfrm>,
}

/// slideMaster XML をパースする。`p:cSld` 配下のプレースホルダ書式には同名要素が大量に現れるため、
/// 拾う位置はパスで確定させる
pub fn parse(xml: &str) -> Result<MasterInfo, BrandError> {
  let mut info = MasterInfo::default();
  // 直近に見つけた `p:ph` が属するシェイプの追跡（#317）。layout_xml と同じ状態機械を共有する
  let mut tracker = PlaceholderShapeTracker::new();
  walk_elements(xml, |stack, name, e| {
    visit(&mut info, &mut tracker, stack, name, e)
  })?;
  Ok(info)
}

fn visit(
  info: &mut MasterInfo,
  tracker: &mut PlaceholderShapeTracker,
  stack: &[String],
  name: &str,
  e: &BytesStart,
) {
  let parent = rel(stack);

  if parent.is_empty() && name == "clrMap" {
    info.color_map.read_attributes(e);
    return;
  }

  if let Some((ph_type, idx)) = tracker.observe(parent, name, e) {
    info.placeholders.push(MasterPlaceholderXfrm {
      ph_type,
      idx,
      xfrm: RawXfrm::default(),
    });
    return;
  }

  if is_xfrm_path(tracker.shape_depth(), parent) {
    if let Some(placeholder) = info.placeholders.last_mut() {
      read_xfrm_child(&mut placeholder.xfrm, name, e);
    }
    return;
  }

  // txStyles/<titleStyle|bodyStyle|otherStyle>/lvl1pPr 配下のみ（lvl2 以降は受け皿に対応する概念がない）
  let Some((style_kind, inner)) = split_lvl1_path(parent) else {
    return;
  };
  let style = match style_kind {
    "titleStyle" => &mut info.title,
    "bodyStyle" => &mut info.body,
    "otherStyle" => &mut info.other,
    _ => return,
  };

  style.visit(inner, name, e);
}

/// パスが `txStyles / <スタイル名> / lvl1pPr / <残り…>` の形なら、スタイル名と残りのパスを返す
fn split_lvl1_path(path: &[String]) -> Option<(&str, &[String])> {
  let [tx_styles, style_kind, lvl, inner @ ..] = path else {
    return None;
  };
  (tx_styles == "txStyles" && lvl == "lvl1pPr").then_some((style_kind.as_str(), inner))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorTransform, Rgb};

  /// 実物の slideMaster1.xml と同じ入れ子（cSld 配下のノイズ入り）を最小構成で再現する
  const MASTER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:lvl1pPr><a:defRPr sz="1050"><a:solidFill><a:srgbClr val="DEADBE"/></a:solidFill></a:defRPr></a:lvl1pPr>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr algn="l">
        <a:defRPr sz="2800" b="0">
          <a:solidFill><a:schemeClr val="tx2"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill>
          <a:latin typeface="+mj-lt"/>
        </a:defRPr>
      </a:lvl1pPr>
      <a:lvl2pPr><a:defRPr sz="9999"/></a:lvl2pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:srgbClr val="4A5356"/></a:solidFill></a:defRPr></a:lvl1pPr>
      <a:lvl2pPr><a:defRPr sz="1600"/></a:lvl2pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>"#;

  #[test]
  fn parses_clr_map_including_inverted_assignments() {
    let info = parse(MASTER_XML).unwrap();
    // ダークテーマの写像（bg1=dk1 / tx1=lt1）をそのまま読む。ここを標準写像で決め打ちすると色が反転する
    assert_eq!(info.color_map.bg1, "dk1");
    assert_eq!(info.color_map.tx1, "lt1");
    assert_eq!(info.color_map.bg2, "dk2");
    assert_eq!(info.color_map.tx2, "lt2");
    assert_eq!(info.color_map.fol_hlink, "folHlink");
  }

  #[test]
  fn resolve_maps_indirect_names_and_passes_slots_through() {
    let info = parse(MASTER_XML).unwrap();
    assert_eq!(info.color_map.resolve("bg1"), "dk1");
    assert_eq!(info.color_map.resolve("tx1"), "lt1");
    // 既に clrScheme のスロット名であるものは写像を通さない
    assert_eq!(info.color_map.resolve("dk1"), "dk1");
    assert_eq!(info.color_map.resolve("accent3"), "accent3");
  }

  #[test]
  fn default_clr_map_is_the_standard_assignment() {
    let map = ClrMap::default();
    assert_eq!(map.bg1, "lt1");
    assert_eq!(map.tx1, "dk1");
    assert_eq!(map.resolve("tx2"), "dk2");
  }

  #[test]
  fn parses_lvl1_sizes_in_points() {
    let info = parse(MASTER_XML).unwrap();
    // sz は 1/100pt なので 2800 → 28pt。lvl2pPr の 9999 に上書きされない
    assert_eq!(info.title.size_pt, Some(28.0));
    assert_eq!(info.body.size_pt, Some(18.0));
    assert_eq!(info.other.size_pt, Some(12.0));
  }

  #[test]
  fn parses_text_colors_with_scheme_reference_and_transforms() {
    let info = parse(MASTER_XML).unwrap();
    let title = info.title.color.expect("title color");
    assert_eq!(title.base, ColorRef::Scheme("tx2".to_string()));
    // lumMod → lumOff の出現順を保つ
    assert_eq!(
      title.transforms,
      vec![ColorTransform::LumMod(0.75), ColorTransform::LumOff(0.25)]
    );

    let body = info.body.color.expect("body color");
    assert_eq!(
      body.base,
      ColorRef::Fixed(Rgb {
        r: 0x4a,
        g: 0x53,
        b: 0x56
      })
    );
    assert!(body.transforms.is_empty());

    assert_eq!(info.other.color, None);
  }

  #[test]
  fn ignores_text_styles_inside_shape_tree() {
    let info = parse(MASTER_XML).unwrap();
    // cSld 配下の sz="1050" / #deadbe を拾っていない
    assert_ne!(info.title.size_pt, Some(10.5));
    assert_ne!(
      info.body.color.and_then(|c| match c.base {
        ColorRef::Fixed(rgb) => Some(rgb.to_hex()),
        ColorRef::Scheme(_) => None,
      }),
      Some("#deadbe".to_string())
    );
  }

  #[test]
  fn malformed_xml_is_an_error_not_a_panic() {
    assert!(matches!(
      parse("<p:sldMaster><p:txStyles></p:sldMaster>"),
      Err(BrandError::Xml(_))
    ));
  }

  #[test]
  fn parse_is_deterministic() {
    let first = parse(MASTER_XML).unwrap();
    for _ in 0..5 {
      assert_eq!(parse(MASTER_XML).unwrap(), first);
    }
  }

  /// slideMaster 自身が持つプレースホルダ（タイトル・本文）の矩形（#317）。layout 側が `a:xfrm` を
  /// 持たない場合の継承元になる
  const MASTER_WITH_PLACEHOLDER_XFRM: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="11277600" cy="1143000"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="609600" y="1600200"/><a:ext cx="10972800" cy="4525963"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Decoration"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="99" cy="99"/></a:xfrm></p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>"#;

  #[test]
  fn parses_own_placeholder_rectangles_from_shape_tree() {
    let info = parse(MASTER_WITH_PLACEHOLDER_XFRM).unwrap();
    assert_eq!(info.placeholders.len(), 2);
    assert_eq!(info.placeholders[0].ph_type.as_deref(), Some("title"));
    assert_eq!(info.placeholders[0].xfrm.off, Some((457_200, 274_638)));
    assert_eq!(info.placeholders[0].xfrm.ext, Some((11_277_600, 1_143_000)));
    assert_eq!(info.placeholders[1].ph_type.as_deref(), Some("body"));
    assert_eq!(info.placeholders[1].idx, Some(1));
    assert_eq!(info.placeholders[1].xfrm.off, Some((609_600, 1_600_200)));
  }

  #[test]
  fn rectangle_of_non_placeholder_shapes_is_not_attributed_to_placeholders() {
    let info = parse(MASTER_WITH_PLACEHOLDER_XFRM).unwrap();
    for placeholder in &info.placeholders {
      assert_ne!(placeholder.xfrm.ext, Some((99, 99)));
    }
  }
}
