//! slideMaster の `p:cSld/p:spTree` 直下の形状（ロゴ候補・帯候補の生データ）を読む（#168）。
//!
//! `p:pic`（画像プレースホルダ）と `p:sp`（塗り付き矩形等）のうち spTree の直下 1 段だけを対象にする。
//! `p:grpSp` 配下やプレースホルダ本文の書式は対象外（ロゴ・帯は通常 spTree 直下に置かれるため、
//! グループ化された装飾まで拾うとヒューリスティクスの誤爆が増える）。
//!
//! 色は他パーサと同じ「基準色 + 変換の出現順」を `ColorSpec` に積むだけで、clrMap → clrScheme の解決は
//! 呼び出し側（`heuristics::classify_bands`）に委ねる。

use quick_xml::events::BytesStart;

use super::color::ColorSpec;
use super::xml::{attr, read_solid_fill, rel, strip_path, ShapeCursor, ShapeEvent};
use super::BrandError;

/// slideMaster の spTree 直下 1 段がシェイプ境界（`p:grpSp` 配下は再帰しない。#168）
const SHAPE_CONTAINERS: [&str; 1] = ["spTree"];

/// `a:xfrm/a:off` と `a:xfrm/a:ext`（EMU）。どちらか欠けている形状はヒューリスティクスの対象から外す
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RawXfrm {
  pub off: Option<(i64, i64)>,
  pub ext: Option<(i64, i64)>,
}

/// `p:pic`（画像）の生データ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawPic {
  /// `p:nvPicPr/p:cNvPr@name`（ロゴ候補ランキングの name hint に使う）
  pub name: Option<String>,
  /// `p:blipFill/a:blip@r:embed`。この part 自身の関係から media part を解決する
  pub embed_rid: Option<String>,
  pub xfrm: RawXfrm,
}

/// `p:sp`（塗り付き形状。帯候補の生データ）
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawShape {
  pub name: Option<String>,
  /// `p:spPr/a:solidFill` の色指定（未解決）。塗りが無い形状（多くのプレースホルダ）は `None`
  pub fill: Option<ColorSpec>,
  pub xfrm: RawXfrm,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawShapes {
  pub pics: Vec<RawPic>,
  pub shapes: Vec<RawShape>,
}

/// 構築中の形状（spTree 直下の境界で確定させ、次の境界で確定済みのものを結果へ積む）
enum Current {
  None,
  Pic(RawPic),
  Sp(RawShape),
}

pub fn parse_shapes(xml: &str) -> Result<RawShapes, BrandError> {
  let mut out = RawShapes::default();
  let mut current = Current::None;
  let mut cursor = ShapeCursor::new(&SHAPE_CONTAINERS);
  super::xml::walk_elements(xml, |stack, name, e| {
    visit(&mut out, &mut current, &mut cursor, stack, name, e)
  })?;
  flush(&mut current, &mut out);
  Ok(out)
}

fn flush(current: &mut Current, out: &mut RawShapes) {
  match std::mem::replace(current, Current::None) {
    Current::Pic(pic) => out.pics.push(pic),
    Current::Sp(sp) => out.shapes.push(sp),
    Current::None => {}
  }
}

fn visit(
  out: &mut RawShapes,
  current: &mut Current,
  cursor: &mut ShapeCursor,
  stack: &[String],
  name: &str,
  e: &BytesStart,
) {
  let path = rel(stack);

  match cursor.observe(path) {
    // spTree 直下 1 段＝新しい形状の境界。直前の形状はここまでで確定している（XML は木構造で、
    // 兄弟要素の開始は前の兄弟の全子要素を読み終えた後にしか来ないため、境界ごとに flush してよい）
    ShapeEvent::Boundary => {
      flush(current, out);
      *current = match name {
        "pic" => Current::Pic(RawPic::default()),
        "sp" => Current::Sp(RawShape::default()),
        _ => Current::None,
      };
    }
    // `p:grpSp` 配下等（current が None）はここで弾かれるので、内部の同名要素を誤って拾わない
    ShapeEvent::Inside(inner) => match current {
      Current::Pic(pic) => visit_pic(pic, inner, name, e),
      Current::Sp(sp) => visit_shape(sp, inner, name, e),
      Current::None => {}
    },
    ShapeEvent::Outside => {}
  }
}

fn visit_pic(pic: &mut RawPic, inner: &[String], name: &str, e: &BytesStart) {
  if inner == ["nvPicPr"] && name == "cNvPr" {
    pic.name = attr(e, "name");
  } else if inner == ["blipFill"] && name == "blip" {
    pic.embed_rid = attr(e, "embed");
  } else {
    apply_xfrm(&mut pic.xfrm, inner, name, e);
  }
}

fn visit_shape(sp: &mut RawShape, inner: &[String], name: &str, e: &BytesStart) {
  if inner == ["nvSpPr"] && name == "cNvPr" {
    sp.name = attr(e, "name");
  } else if let Some(rest) = strip_path(inner, &["spPr", "solidFill"]) {
    read_solid_fill(&mut sp.fill, rest, name, e);
  } else {
    apply_xfrm(&mut sp.xfrm, inner, name, e);
  }
}

/// `p:spPr/a:xfrm/a:off|a:ext`（pic・sp で共通）
fn apply_xfrm(xfrm: &mut RawXfrm, inner: &[String], name: &str, e: &BytesStart) {
  if inner != ["spPr", "xfrm"] {
    return;
  }
  read_xfrm_child(xfrm, name, e);
}

/// `a:xfrm` の子要素（`a:off`/`a:ext`）を読む。呼び出し側で「今 `p:spPr/a:xfrm` 配下にいる」ことを
/// 確認した上で呼ぶ。プレースホルダの矩形抽出（`layout_xml`/`master_xml`。#317）もこの読み取りを共有する
pub fn read_xfrm_child(xfrm: &mut RawXfrm, name: &str, e: &BytesStart) {
  match name {
    "off" => {
      if let (Some(x), Some(y)) = (parse_i64(e, "x"), parse_i64(e, "y")) {
        xfrm.off = Some((x, y));
      }
    }
    "ext" => {
      if let (Some(cx), Some(cy)) = (parse_i64(e, "cx"), parse_i64(e, "cy")) {
        xfrm.ext = Some((cx, cy));
      }
    }
    _ => {}
  }
}

fn parse_i64(e: &BytesStart, key: &str) -> Option<i64> {
  attr(e, key)?.trim().parse::<i64>().ok()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorTransform, Rgb};

  /// 実物の slideMaster を模した spTree（ロゴ画像 1 個・上帯/左帯の矩形 2 個・塗り無しのプレースホルダ 1 個）
  const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Top Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="457200"/></a:xfrm>
          <a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Left Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="609600" cy="6858000"/></a:xfrm>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="5" name="Company Logo"/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="10500000" y="6400000"/><a:ext cx="900000" cy="300000"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#;

  #[test]
  fn collects_pics_and_shapes_at_sp_tree_depth() {
    let parsed = parse_shapes(XML).unwrap();
    assert_eq!(parsed.shapes.len(), 3); // title placeholder + 2 bands
    assert_eq!(parsed.pics.len(), 1);
  }

  #[test]
  fn reads_pic_name_embed_and_geometry() {
    let parsed = parse_shapes(XML).unwrap();
    let pic = &parsed.pics[0];
    assert_eq!(pic.name.as_deref(), Some("Company Logo"));
    assert_eq!(pic.embed_rid.as_deref(), Some("rId9"));
    assert_eq!(pic.xfrm.off, Some((10_500_000, 6_400_000)));
    assert_eq!(pic.xfrm.ext, Some((900_000, 300_000)));
  }

  #[test]
  fn placeholder_without_fill_has_no_color_spec() {
    let parsed = parse_shapes(XML).unwrap();
    let title = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Title Placeholder 1"))
      .unwrap();
    assert_eq!(title.fill, None);
    assert_eq!(title.xfrm, RawXfrm::default());
  }

  #[test]
  fn resolves_scheme_fill_with_transform_and_fixed_fill() {
    let parsed = parse_shapes(XML).unwrap();
    let top = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Top Band"))
      .unwrap();
    let fill = top.fill.clone().expect("top band fill");
    assert_eq!(fill.base, ColorRef::Scheme("accent1".to_string()));
    assert_eq!(fill.transforms, vec![ColorTransform::LumMod(0.75)]);
    assert_eq!(top.xfrm.off, Some((0, 0)));
    assert_eq!(top.xfrm.ext, Some((12_192_000, 457_200)));

    let left = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Left Band"))
      .unwrap();
    assert_eq!(
      left.fill.as_ref().unwrap().base,
      ColorRef::Fixed(Rgb {
        r: 0x1f,
        g: 0x4e,
        b: 0x79
      })
    );
  }

  #[test]
  fn ignores_shapes_nested_inside_groups() {
    let xml = r#"<p:sldMaster xmlns:p="p" xmlns:a="a">
      <p:cSld><p:spTree>
        <p:grpSp>
          <p:sp><p:nvSpPr><p:cNvPr name="Nested"/></p:nvSpPr><p:spPr/></p:sp>
        </p:grpSp>
      </p:spTree></p:cSld>
    </p:sldMaster>"#;
    let parsed = parse_shapes(xml).unwrap();
    assert_eq!(parsed.shapes.len(), 0);
    assert_eq!(parsed.pics.len(), 0);
  }

  #[test]
  fn parse_is_deterministic() {
    let first = parse_shapes(XML).unwrap();
    for _ in 0..5 {
      assert_eq!(parse_shapes(XML).unwrap(), first);
    }
  }

  #[test]
  fn malformed_xml_is_an_error_not_a_panic() {
    assert!(matches!(
      parse_shapes("<p:sldMaster><p:cSld></p:sldMaster>"),
      Err(BrandError::Xml(_))
    ));
  }
}
