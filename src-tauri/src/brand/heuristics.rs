//! ロゴ候補ランキング・帯検出のヒューリスティクス（#168）。
//!
//! 「帯検出・ロゴ候補ランキング等のヒューリスティクスは誤爆しうる」（#168 の背景）ため、
//! ここで確定させるのは並置比較ダイアログに出す**候補**までで、採否は人が確認ダイアログで決める。
//! 幾何判定・スコアだけを扱う純関数にし、乱数・走査順（`HashMap` 等）に依存しない（決定的）。

use std::collections::BTreeSet;

use super::color::Rgb;
use super::master_xml::ClrMap;
use super::opc::SlideSize;
use super::shapes::{RawPic, RawShape};
use super::theme_xml::ClrScheme;

/// UI に出す候補数の上限（多数のプレースホルダを持つマスターでも応答サイズを抑える）
const MAX_LOGO_CANDIDATES: usize = 8;
const MAX_BAND_CANDIDATES: usize = 8;

/// 帯の端とスライド境界のずれの許容比（実物のテンプレートは数 EMU〜数万 EMU 単位でぴったり 0 にならない）
const EDGE_TOLERANCE: f64 = 0.06;
/// 帯とみなす最大の厚み比（これを超えると背景全面や別の意図の形状とみなし対象外にする）
const MAX_BAND_THICKNESS_RATIO: f64 = 0.3;

/// ランキング済みのロゴ候補（画像バイト列はまだ解決しない。呼び出し側が上位候補だけ media を読む）
#[derive(Debug, Clone, PartialEq)]
pub struct RankedLogo {
  pub name_hint: Option<String>,
  pub embed_rid: String,
  pub x_emu: i64,
  pub y_emu: i64,
  pub width_emu: i64,
  pub height_emu: i64,
}

/// `p:pic` の生データをスコアリングし降順に並べる。
/// 位置・寸法・`r:embed` のいずれかが欠けている形状は候補にできないので除外する
pub fn rank_logo_candidates(pics: &[RawPic], slide: SlideSize) -> Vec<RankedLogo> {
  let mut scored: Vec<(f64, usize, RankedLogo)> = pics
    .iter()
    .enumerate()
    .filter_map(|(order, pic)| {
      let embed_rid = pic.embed_rid.clone()?;
      let (x, y) = pic.xfrm.off?;
      let (w, h) = pic.xfrm.ext?;
      if w <= 0 || h <= 0 {
        return None;
      }
      let score = logo_score(pic.name.as_deref(), x, y, w, h, slide);
      Some((
        score,
        order,
        RankedLogo {
          name_hint: pic.name.clone(),
          embed_rid,
          x_emu: x,
          y_emu: y,
          width_emu: w,
          height_emu: h,
        },
      ))
    })
    .collect();
  // 降順スコア。同点は出現順（安定ソート＋ order 昇順のタイブレーク）で決着させ、結果を決定的にする
  scored.sort_by(|a, b| {
    b.0
      .partial_cmp(&a.0)
      .unwrap_or(std::cmp::Ordering::Equal)
      .then(a.1.cmp(&b.1))
  });
  scored
    .into_iter()
    .take(MAX_LOGO_CANDIDATES)
    .map(|(_, _, logo)| logo)
    .collect()
}

/// name hint（"logo" を含む名前）を最優先の判断材料にし、角に近く・小さい形状を次点で優先する
fn logo_score(name: Option<&str>, x: i64, y: i64, w: i64, h: i64, slide: SlideSize) -> f64 {
  let name_hint_bonus = name
    .map(|n| n.to_ascii_lowercase().contains("logo"))
    .unwrap_or(false);
  let corner = corner_proximity_score(x, y, w, h, slide);
  let size = size_score(w, h, slide);
  (if name_hint_bonus { 1.0 } else { 0.0 }) + 0.5 * corner + 0.3 * size
}

/// 形状の中心から最も近いスライドの角までの距離を対角線比で正規化する（0=角に接する、1=中心）
fn corner_proximity_score(x: i64, y: i64, w: i64, h: i64, slide: SlideSize) -> f64 {
  let (center_x, center_y) = (x as f64 + w as f64 / 2.0, y as f64 + h as f64 / 2.0);
  let (slide_w, slide_h) = (slide.width_emu as f64, slide.height_emu as f64);
  let diagonal = (slide_w * slide_w + slide_h * slide_h).sqrt();
  if diagonal <= 0.0 {
    return 0.0;
  }
  let corners = [
    (0.0, 0.0),
    (slide_w, 0.0),
    (0.0, slide_h),
    (slide_w, slide_h),
  ];
  let nearest = corners
    .iter()
    .map(|(corner_x, corner_y)| {
      ((center_x - corner_x).powi(2) + (center_y - corner_y).powi(2)).sqrt()
    })
    .fold(f64::MAX, f64::min);
  (1.0 - nearest / diagonal).clamp(0.0, 1.0)
}

/// スライド全体に対する面積比が小さいほど高スコアにする（ロゴは通常スライド全体に対して小さい）
fn size_score(w: i64, h: i64, slide: SlideSize) -> f64 {
  let slide_area = (slide.width_emu as f64 * slide.height_emu as f64).max(1.0);
  let area_ratio = (w as f64 * h as f64) / slide_area;
  (1.0 - area_ratio * 5.0).clamp(0.0, 1.0)
}

/// 検出した帯（辺いっぱいに伸びる塗り矩形）の幾何・色。`anchor`/`orientation` は
/// `MasterAnchor`/`BandMasterDecoration.orientation`（フロント `src/data/types.ts`）と同じ語彙にしてある
#[derive(Debug, Clone, PartialEq)]
pub struct BandGeometry {
  pub orientation: &'static str,
  pub anchor: &'static str,
  pub color: Rgb,
  pub thickness_emu: i64,
}

/// `p:sp` の生データから、辺いっぱいに伸びる塗り矩形を帯候補として分類する。
/// 塗り無し・位置寸法不明・辺に届いていない（中央にある等）形状は対象外にする
pub fn classify_bands(
  shapes: &[RawShape],
  scheme: &ClrScheme,
  map: &ClrMap,
  slide: SlideSize,
) -> Vec<BandGeometry> {
  let mut seen = BTreeSet::new();
  let mut out = Vec::new();
  for shape in shapes {
    let Some((x, y)) = shape.xfrm.off else {
      continue;
    };
    let Some((w, h)) = shape.xfrm.ext else {
      continue;
    };
    if w <= 0 || h <= 0 {
      continue;
    }
    let Some(spec) = &shape.fill else { continue };
    let Some(color) = super::resolve_color_spec(spec, scheme, map) else {
      continue;
    };
    let Some((orientation, anchor)) = classify_geometry(x, y, w, h, slide) else {
      continue;
    };
    let thickness_emu = if orientation == "horizontal" { h } else { w };
    // 同一の見た目（向き・アンカー・色・厚み）の重複は 1 件に畳む（縁取り用の重ね形状等のノイズ対策）
    if !seen.insert((orientation, anchor, color.to_hex(), thickness_emu)) {
      continue;
    }
    out.push(BandGeometry {
      orientation,
      anchor,
      color,
      thickness_emu,
    });
    if out.len() >= MAX_BAND_CANDIDATES {
      break;
    }
  }
  out
}

/// 辺いっぱいに伸びているかを幾何だけで判定する（帯として扱う辺は上下左右の 4 方向のみ。
/// 中央付近の帯・斜めの帯は `MasterAnchor` の語彙で表現できないため対象外にする）
fn classify_geometry(
  x: i64,
  y: i64,
  w: i64,
  h: i64,
  slide: SlideSize,
) -> Option<(&'static str, &'static str)> {
  let slide_w = slide.width_emu as f64;
  let slide_h = slide.height_emu as f64;
  let width_ratio = w as f64 / slide_w;
  let height_ratio = h as f64 / slide_h;

  if width_ratio >= 1.0 - EDGE_TOLERANCE && height_ratio <= MAX_BAND_THICKNESS_RATIO {
    let top_gap = y as f64 / slide_h;
    let bottom_gap = (slide_h - (y as f64 + h as f64)) / slide_h;
    if top_gap.abs() <= EDGE_TOLERANCE {
      return Some(("horizontal", "top-center"));
    }
    if bottom_gap.abs() <= EDGE_TOLERANCE {
      return Some(("horizontal", "bottom-center"));
    }
    return None;
  }

  if height_ratio >= 1.0 - EDGE_TOLERANCE && width_ratio <= MAX_BAND_THICKNESS_RATIO {
    let left_gap = x as f64 / slide_w;
    let right_gap = (slide_w - (x as f64 + w as f64)) / slide_w;
    if left_gap.abs() <= EDGE_TOLERANCE {
      return Some(("vertical", "middle-left"));
    }
    if right_gap.abs() <= EDGE_TOLERANCE {
      return Some(("vertical", "middle-right"));
    }
    return None;
  }

  None
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorSpec, ColorTransform, Rgb};
  use crate::brand::shapes::RawXfrm;

  const SLIDE: SlideSize = SlideSize {
    width_emu: 12_192_000,
    height_emu: 6_858_000,
  };

  fn pic(name: Option<&str>, embed: Option<&str>, off: (i64, i64), ext: (i64, i64)) -> RawPic {
    RawPic {
      name: name.map(str::to_string),
      embed_rid: embed.map(str::to_string),
      xfrm: RawXfrm {
        off: Some(off),
        ext: Some(ext),
      },
    }
  }

  #[test]
  fn ranks_named_logo_above_larger_centered_image() {
    let pics = vec![
      // 中央付近の大きい画像（背景写真等）
      pic(
        Some("Picture 1"),
        Some("rId2"),
        (2_000_000, 1_500_000),
        (8_000_000, 4_000_000),
      ),
      // 右下角の小さい画像で name hint あり
      pic(
        Some("Company Logo"),
        Some("rId9"),
        (10_500_000, 6_400_000),
        (900_000, 300_000),
      ),
    ];
    let ranked = rank_logo_candidates(&pics, SLIDE);
    assert_eq!(ranked.len(), 2);
    assert_eq!(ranked[0].embed_rid, "rId9");
    assert_eq!(ranked[0].name_hint.as_deref(), Some("Company Logo"));
  }

  #[test]
  fn excludes_pics_without_embed_or_geometry() {
    let mut missing_embed = pic(Some("X"), None, (0, 0), (100, 100));
    missing_embed.embed_rid = None;
    let mut missing_xfrm = pic(Some("Y"), Some("rId1"), (0, 0), (100, 100));
    missing_xfrm.xfrm.ext = None;
    let ranked = rank_logo_candidates(&[missing_embed, missing_xfrm], SLIDE);
    assert_eq!(ranked.len(), 0);
  }

  #[test]
  fn ranking_is_deterministic_for_ties() {
    let pics = vec![
      pic(Some("A"), Some("rId1"), (0, 0), (500_000, 500_000)),
      pic(Some("B"), Some("rId2"), (0, 0), (500_000, 500_000)),
    ];
    let first = rank_logo_candidates(&pics, SLIDE);
    for _ in 0..5 {
      assert_eq!(rank_logo_candidates(&pics, SLIDE), first);
    }
    // 同点は出現順（rId1 が先）
    assert_eq!(first[0].embed_rid, "rId1");
  }

  fn shape(name: &str, off: (i64, i64), ext: (i64, i64), fill: Option<ColorSpec>) -> RawShape {
    RawShape {
      name: Some(name.to_string()),
      fill,
      xfrm: RawXfrm {
        off: Some(off),
        ext: Some(ext),
      },
    }
  }

  fn fixed_fill(hex: &str) -> ColorSpec {
    ColorSpec::new(ColorRef::Fixed(
      crate::brand::color::parse_hex(hex).unwrap(),
    ))
  }

  #[test]
  fn classifies_top_and_left_bands() {
    let shapes = vec![
      shape(
        "Top Band",
        (0, 0),
        (12_192_000, 457_200),
        Some(fixed_fill("1F4E79")),
      ),
      shape(
        "Left Band",
        (0, 0),
        (609_600, 6_858_000),
        Some(fixed_fill("ED7D31")),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let bands = classify_bands(&shapes, &scheme, &map, SLIDE);
    assert_eq!(bands.len(), 2);
    assert_eq!(bands[0].orientation, "horizontal");
    assert_eq!(bands[0].anchor, "top-center");
    assert_eq!(bands[0].color.to_hex(), "#1f4e79");
    assert_eq!(bands[0].thickness_emu, 457_200);
    assert_eq!(bands[1].orientation, "vertical");
    assert_eq!(bands[1].anchor, "middle-left");
  }

  #[test]
  fn classifies_bottom_and_right_bands() {
    let shapes = vec![
      shape(
        "Bottom Band",
        (0, 6_400_800),
        (12_192_000, 457_200),
        Some(fixed_fill("000000")),
      ),
      shape(
        "Right Band",
        (11_582_400, 0),
        (609_600, 6_858_000),
        Some(fixed_fill("FFFFFF")),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let bands = classify_bands(&shapes, &scheme, &map, SLIDE);
    assert_eq!(bands[0].anchor, "bottom-center");
    assert_eq!(bands[1].anchor, "middle-right");
  }

  #[test]
  fn ignores_shapes_without_fill_or_not_spanning_an_edge() {
    let shapes = vec![
      // 塗りなし（プレースホルダ等）
      shape("Title", (100, 100), (4_000_000, 1_000_000), None),
      // 辺いっぱいに伸びていない中央の矩形
      shape(
        "Center Box",
        (4_000_000, 3_000_000),
        (4_000_000, 800_000),
        Some(fixed_fill("336699")),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_bands(&shapes, &scheme, &map, SLIDE).len(), 0);
  }

  #[test]
  fn resolves_scheme_color_and_transforms_via_clr_map() {
    let scheme = ClrScheme {
      accent1: Some(Rgb {
        r: 0x1f,
        g: 0x4e,
        b: 0x79,
      }),
      ..ClrScheme::default()
    };
    let map = ClrMap::default();
    let mut spec = ColorSpec::new(ColorRef::Scheme("accent1".to_string()));
    spec.transforms.push(ColorTransform::LumMod(0.75));
    let shapes = vec![shape("Top Band", (0, 0), (12_192_000, 457_200), Some(spec))];
    let bands = classify_bands(&shapes, &scheme, &map, SLIDE);
    assert_eq!(bands.len(), 1);
    // lumMod 75% で原色より暗くなっている
    assert_ne!(bands[0].color.to_hex(), "#1f4e79");
  }

  #[test]
  fn dedupes_identical_band_geometry() {
    let shapes = vec![
      shape(
        "Top Band",
        (0, 0),
        (12_192_000, 457_200),
        Some(fixed_fill("1F4E79")),
      ),
      // 同じ見た目の重ね形状（縁取り等）
      shape(
        "Top Band Shadow",
        (0, 0),
        (12_192_000, 457_200),
        Some(fixed_fill("1F4E79")),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_bands(&shapes, &scheme, &map, SLIDE).len(), 1);
  }

  #[test]
  fn classification_is_deterministic() {
    let shapes = vec![
      shape(
        "Top Band",
        (0, 0),
        (12_192_000, 457_200),
        Some(fixed_fill("1F4E79")),
      ),
      shape(
        "Left Band",
        (0, 0),
        (609_600, 6_858_000),
        Some(fixed_fill("ED7D31")),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let first = classify_bands(&shapes, &scheme, &map, SLIDE);
    for _ in 0..5 {
      assert_eq!(classify_bands(&shapes, &scheme, &map, SLIDE), first);
    }
  }
}
