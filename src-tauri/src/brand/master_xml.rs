//! slideMaster part（`p:sldMaster` = slideMaster1.xml）のパーサ（#167）。
//!
//! 取るのは `p:clrMap` と `p:txStyles` の第 1 レベル既定だけ。
//!
//! - `p:clrMap` は `bg1`/`tx1`/`bg2`/`tx2` が clrScheme のどのスロットを指すかの写像で、
//!   テンプレートによって `bg1="lt1"` と `bg1="dk1"` が入れ替わる（ダークテーマ）。写像を飛ばすと背景と文字色が反転する。
//! - `p:txStyles/…/a:lvl1pPr/a:defRPr@sz` は 1/100pt 単位の実サイズ。目視では比率しか分からない情報。

use quick_xml::events::BytesStart;

use super::color::{ColorSpec, ColorTransform};
use super::xml::{attr, base_color_ref, child_of, rel, walk_elements};
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

/// `p:txStyles` の第 1 レベル既定（`a:lvl1pPr/a:defRPr`）。色は clrScheme を当てるまで未解決のまま持つ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawTextStyle {
  /// `a:defRPr@sz`（1/100pt）を実 pt へ直した値
  pub size_pt: Option<f64>,
  /// `a:defRPr/a:solidFill` の色指定
  pub color: Option<ColorSpec>,
}

/// slideMaster から抽出した内容
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MasterInfo {
  pub color_map: ClrMap,
  /// `p:titleStyle`
  pub title: RawTextStyle,
  /// `p:bodyStyle`
  pub body: RawTextStyle,
  /// `p:otherStyle`
  pub other: RawTextStyle,
}

/// slideMaster XML をパースする。`p:cSld` 配下のプレースホルダ書式には同名要素が大量に現れるため、
/// 拾う位置はパスで確定させる
pub fn parse(xml: &str) -> Result<MasterInfo, BrandError> {
  let mut info = MasterInfo::default();
  walk_elements(xml, |stack, name, e| visit(&mut info, stack, name, e))?;
  Ok(info)
}

fn visit(info: &mut MasterInfo, stack: &[String], name: &str, e: &BytesStart) {
  let parent = rel(stack);

  if parent.is_empty() && name == "clrMap" {
    info.color_map.read_attributes(e);
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

  if inner.is_empty() && name == "defRPr" {
    // sz は 1/100pt。0 以下は不正値として捨てる
    style.size_pt = attr(e, "sz")
      .and_then(|v| v.trim().parse::<f64>().ok())
      .filter(|v| *v > 0.0)
      .map(|v| v / 100.0);
  } else if inner == ["defRPr", "solidFill"] {
    if let Some(base) = base_color_ref(name, e) {
      style.color = Some(ColorSpec::new(base));
    }
  } else if child_of(inner, &["defRPr", "solidFill"]).is_some() {
    // 基準色要素の子＝色変換（lumMod/lumOff/tint/shade）
    let transform = attr(e, "val").and_then(|v| ColorTransform::from_element(name, &v));
    if let (Some(transform), Some(spec)) = (transform, style.color.as_mut()) {
      spec.transforms.push(transform);
    }
  }
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
  use crate::brand::color::{ColorRef, Rgb};

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
}
