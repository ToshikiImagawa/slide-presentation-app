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
const MAX_TEXT_CANDIDATES: usize = 8;

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

/// name hint（"logo" を含む名前）の寄与が最も大きく、角への近さ・小ささはそれに次ぐ判断材料にする
const NAME_HINT_WEIGHT: f64 = 1.0;
const CORNER_PROXIMITY_WEIGHT: f64 = 0.5;
const SIZE_WEIGHT: f64 = 0.3;

/// name hint（"logo" を含む名前）を最優先の判断材料にし、角に近く・小さい形状を次点で優先する
fn logo_score(name: Option<&str>, x: i64, y: i64, w: i64, h: i64, slide: SlideSize) -> f64 {
  let name_hint_bonus = name
    .map(|n| n.to_ascii_lowercase().contains("logo"))
    .unwrap_or(false);
  let corner = corner_proximity_score(x, y, w, h, slide);
  let size = size_score(w, h, slide);
  (if name_hint_bonus {
    NAME_HINT_WEIGHT
  } else {
    0.0
  }) + CORNER_PROXIMITY_WEIGHT * corner
    + SIZE_WEIGHT * size
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
    let near_gap = y as f64 / slide_h;
    let far_gap = (slide_h - (y as f64 + h as f64)) / slide_h;
    return Some((
      "horizontal",
      edge_anchor(near_gap, far_gap, "top-center", "bottom-center")?,
    ));
  }

  if height_ratio >= 1.0 - EDGE_TOLERANCE && width_ratio <= MAX_BAND_THICKNESS_RATIO {
    let near_gap = x as f64 / slide_w;
    let far_gap = (slide_w - (x as f64 + w as f64)) / slide_w;
    return Some((
      "vertical",
      edge_anchor(near_gap, far_gap, "middle-left", "middle-right")?,
    ));
  }

  None
}

/// 帯の近い方の端がスライド境界に接しているかで、どちらの辺に属するアンカーかを決める。
/// どちらの端にも接していない（中央にある）場合は `None`
fn edge_anchor(
  near_gap: f64,
  far_gap: f64,
  near_anchor: &'static str,
  far_anchor: &'static str,
) -> Option<&'static str> {
  if near_gap.abs() <= EDGE_TOLERANCE {
    return Some(near_anchor);
  }
  if far_gap.abs() <= EDGE_TOLERANCE {
    return Some(far_anchor);
  }
  None
}

/// マーク（小図形のブランドマーク）候補1件を構成する形状の幾何・色・種別（円/正方形。#346）
#[derive(Debug, Clone, PartialEq)]
pub struct MarkShapeGeometry {
  pub x_emu: i64,
  pub y_emu: i64,
  pub width_emu: i64,
  pub height_emu: i64,
  pub color: Rgb,
  /// `a:prstGeom@prst == "ellipse"` なら円（`borderRadius` = 辺の半分に変換する）。それ以外は正方形扱い（`borderRadius` = 0）
  pub is_circle: bool,
}

/// 同一サイズ・近接した形状のまとまり（1つのブランドマークを構成する候補。#346）
#[derive(Debug, Clone, PartialEq)]
pub struct MarkGroup {
  pub shapes: Vec<MarkShapeGeometry>,
}

/// UI に出すマーク候補（グループ）数の上限
const MAX_MARK_CANDIDATES: usize = 8;
/// 「キャンバスに対して十分小さい」の上限比（短辺に対する辺の比率）。これを超える形状は帯や背景の
/// 一部とみなし対象外にする
const MAX_MARK_SIZE_RATIO: f64 = 0.12;
/// 同一サイズの形状が「近接して並んでいる」とみなす最大距離比（短辺に対する中心間の最大距離）。
/// これを超えて散らばっている場合は背景パターン等とみなし対象外にする
const MAX_MARK_CLUSTER_SPAN_RATIO: f64 = 0.3;

/// `p:sp` の生データから、ブランドマーク候補（同一サイズの単色小図形が複数近接して並んでいるまとまり）を
/// 抽出する（#346）。判定条件は3つすべてを満たすこと: ①キャンバス短辺に対して十分小さい、②単色塗り、
/// ③同一サイズの形状が複数・近接している（1個だけの小図形は誤検知が多いため候補にしない）。
/// 走査は `shapes` の記述順のまま処理し（`HashMap` を使わない）、結果が決定的になるようにする
pub fn classify_marks(
  shapes: &[RawShape],
  scheme: &ClrScheme,
  map: &ClrMap,
  slide: SlideSize,
) -> Vec<MarkGroup> {
  let short_side = slide.width_emu.min(slide.height_emu) as f64;
  if short_side <= 0.0 {
    return Vec::new();
  }

  let candidates: Vec<MarkShapeGeometry> = shapes
    .iter()
    .filter_map(|shape| {
      let (x, y) = shape.xfrm.off?;
      let (w, h) = shape.xfrm.ext?;
      if w <= 0 || h <= 0 {
        return None;
      }
      if w as f64 / short_side >= MAX_MARK_SIZE_RATIO
        || h as f64 / short_side >= MAX_MARK_SIZE_RATIO
      {
        return None;
      }
      let spec = shape.fill.as_ref()?;
      let color = super::resolve_color_spec(spec, scheme, map)?;
      Some(MarkShapeGeometry {
        x_emu: x,
        y_emu: y,
        width_emu: w,
        height_emu: h,
        color,
        is_circle: shape.prst_geom.as_deref() == Some("ellipse"),
      })
    })
    .collect();

  let mut visited = vec![false; candidates.len()];
  let mut groups: Vec<MarkGroup> = Vec::new();
  for i in 0..candidates.len() {
    if visited[i] {
      continue;
    }
    let mut group_indices = vec![i];
    for (j, candidate) in candidates.iter().enumerate().skip(i + 1) {
      if !visited[j]
        && candidate.width_emu == candidates[i].width_emu
        && candidate.height_emu == candidates[i].height_emu
      {
        group_indices.push(j);
      }
    }
    for &idx in &group_indices {
      visited[idx] = true;
    }
    // 1個だけの小図形はアイコン・装飾の断片である可能性が高く、ブランドマークと区別できないため候補にしない
    if group_indices.len() < 2 {
      continue;
    }
    if !is_clustered(&group_indices, &candidates, short_side) {
      continue;
    }
    groups.push(MarkGroup {
      shapes: group_indices
        .into_iter()
        .map(|idx| candidates[idx].clone())
        .collect(),
    });
    if groups.len() >= MAX_MARK_CANDIDATES {
      break;
    }
  }
  groups
}

/// グループ内の形状すべてが互いに近接しているか（中心間の最大距離が短辺に対する閾値以下か）を判定する
fn is_clustered(indices: &[usize], shapes: &[MarkShapeGeometry], short_side: f64) -> bool {
  let centers: Vec<(f64, f64)> = indices
    .iter()
    .map(|&i| {
      let s = &shapes[i];
      (
        s.x_emu as f64 + s.width_emu as f64 / 2.0,
        s.y_emu as f64 + s.height_emu as f64 / 2.0,
      )
    })
    .collect();
  let max_distance = centers
    .iter()
    .enumerate()
    .flat_map(|(i, &(ax, ay))| {
      centers[(i + 1)..]
        .iter()
        .map(move |&(bx, by)| ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt())
    })
    .fold(0.0_f64, f64::max);
  max_distance / short_side <= MAX_MARK_CLUSTER_SPAN_RATIO
}

/// 固定テキスト/ページ番号候補の幾何・文字プロパティ（#318）。`anchor`/`offset` への変換は
/// フロント（`compile()`）が `bandToDecoration` と同じ EMU→px 換算を使って行うため、
/// ここでは EMU の矩形のまま渡す
#[derive(Debug, Clone, PartialEq)]
pub struct TextGeometry {
  pub content: String,
  pub x_emu: i64,
  pub y_emu: i64,
  pub width_emu: i64,
  pub height_emu: i64,
  pub size_pt: Option<f64>,
  pub color: Option<Rgb>,
}

/// `p:sp` の生データから、固定テキスト/ページ番号の装飾候補を列挙する（#318）。
/// プレースホルダ（`is_placeholder`）・空文字・矩形不明（`off`/`ext` のいずれか欠け・非正の寸法）の
/// 形状は対象外にする（位置が無い候補は装飾として描けず、候補にする意味がないため）。
/// 帯・ロゴのような角度付きスコアリングは行わない（誤爆しうるヒューリスティクスではなく、
/// 「非プレースホルダかつテキストを持つ」という決定的な条件だけで候補にする）
pub fn list_text_candidates(
  shapes: &[RawShape],
  scheme: &ClrScheme,
  map: &ClrMap,
) -> Vec<TextGeometry> {
  shapes
    .iter()
    .filter(|shape| !shape.is_placeholder)
    .filter_map(|shape| {
      let content = shape.text.content.trim();
      if content.is_empty() {
        return None;
      }
      let (x_emu, y_emu) = shape.xfrm.off?;
      let (width_emu, height_emu) = shape.xfrm.ext?;
      if width_emu <= 0 || height_emu <= 0 {
        return None;
      }
      Some(TextGeometry {
        content: content.to_string(),
        x_emu,
        y_emu,
        width_emu,
        height_emu,
        size_pt: shape.text.props.size_pt,
        color: shape.text.props.resolve_color(scheme, map),
      })
    })
    .take(MAX_TEXT_CANDIDATES)
    .collect()
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
      ..RawShape::default()
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

  fn text_shape(
    name: &str,
    content: &str,
    off: (i64, i64),
    ext: (i64, i64),
    is_placeholder: bool,
  ) -> RawShape {
    RawShape {
      name: Some(name.to_string()),
      xfrm: RawXfrm {
        off: Some(off),
        ext: Some(ext),
      },
      is_placeholder,
      text: crate::brand::shapes::RawShapeText {
        content: content.to_string(),
        props: crate::brand::text_props::RawTextProps::default(),
      },
      ..RawShape::default()
    }
  }

  #[test]
  fn lists_non_placeholder_text_shape_as_candidate() {
    let shapes = vec![text_shape(
      "Footer",
      "© 2026 Acme Corp",
      (457_200, 6_400_800),
      (5_000_000, 300_000),
      false,
    )];
    let candidates = list_text_candidates(&shapes, &ClrScheme::default(), &ClrMap::default());
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].content, "© 2026 Acme Corp");
    assert_eq!(candidates[0].x_emu, 457_200);
    assert_eq!(candidates[0].y_emu, 6_400_800);
    assert_eq!(candidates[0].width_emu, 5_000_000);
    assert_eq!(candidates[0].height_emu, 300_000);
  }

  #[test]
  fn excludes_placeholder_text_shapes() {
    let shapes = vec![text_shape(
      "Title Placeholder",
      "タイトル",
      (0, 0),
      (1_000_000, 1_000_000),
      true,
    )];
    let candidates = list_text_candidates(&shapes, &ClrScheme::default(), &ClrMap::default());
    assert_eq!(candidates.len(), 0);
  }

  #[test]
  fn excludes_shapes_without_text_or_geometry() {
    let mut empty_text = text_shape("Empty", "   ", (0, 0), (1_000_000, 1_000_000), false);
    empty_text.text.content = "   ".to_string();
    let mut missing_xfrm = text_shape(
      "NoRect",
      "固定テキスト",
      (0, 0),
      (1_000_000, 1_000_000),
      false,
    );
    missing_xfrm.xfrm.ext = None;
    let candidates = list_text_candidates(
      &[empty_text, missing_xfrm],
      &ClrScheme::default(),
      &ClrMap::default(),
    );
    assert_eq!(candidates.len(), 0);
  }

  #[test]
  fn resolves_scheme_color_and_size_for_text_candidate() {
    let mut shape = text_shape(
      "Footer",
      "固定テキスト",
      (0, 6_400_800),
      (5_000_000, 300_000),
      false,
    );
    shape.text.props.size_pt = Some(10.0);
    shape.text.props.color = Some(ColorSpec::new(ColorRef::Scheme("accent1".to_string())));
    let scheme = ClrScheme {
      accent1: Some(Rgb {
        r: 0x44,
        g: 0x54,
        b: 0x6a,
      }),
      ..ClrScheme::default()
    };
    let candidates = list_text_candidates(&[shape], &scheme, &ClrMap::default());
    assert_eq!(candidates[0].size_pt, Some(10.0));
    assert_eq!(
      candidates[0].color,
      Some(Rgb {
        r: 0x44,
        g: 0x54,
        b: 0x6a
      })
    );
  }

  #[test]
  fn text_candidate_listing_is_deterministic() {
    let shapes = vec![text_shape(
      "Footer",
      "固定テキスト",
      (0, 6_400_800),
      (5_000_000, 300_000),
      false,
    )];
    let first = list_text_candidates(&shapes, &ClrScheme::default(), &ClrMap::default());
    for _ in 0..5 {
      assert_eq!(
        list_text_candidates(&shapes, &ClrScheme::default(), &ClrMap::default()),
        first
      );
    }
  }

  fn mark_shape(
    name: &str,
    off: (i64, i64),
    ext: (i64, i64),
    fill: Option<ColorSpec>,
    prst_geom: Option<&str>,
  ) -> RawShape {
    RawShape {
      name: Some(name.to_string()),
      fill,
      xfrm: RawXfrm {
        off: Some(off),
        ext: Some(ext),
      },
      prst_geom: prst_geom.map(str::to_string),
      ..RawShape::default()
    }
  }

  #[test]
  fn classifies_same_size_nearby_shapes_as_a_mark_candidate() {
    let shapes = vec![
      mark_shape(
        "Dot 1",
        (0, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
      mark_shape(
        "Dot 2",
        (400_000, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let groups = classify_marks(&shapes, &scheme, &map, SLIDE);
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].shapes.len(), 2);
    assert!(groups[0].shapes.iter().all(|s| s.is_circle));
  }

  #[test]
  fn excludes_mark_candidates_too_large_relative_to_the_slide() {
    let shapes = vec![
      mark_shape(
        "Big 1",
        (0, 0),
        (2_000_000, 2_000_000),
        Some(fixed_fill("1F4E79")),
        None,
      ),
      mark_shape(
        "Big 2",
        (2_100_000, 0),
        (2_000_000, 2_000_000),
        Some(fixed_fill("1F4E79")),
        None,
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_marks(&shapes, &scheme, &map, SLIDE).len(), 0);
  }

  #[test]
  fn excludes_mark_candidates_without_fill() {
    let shapes = vec![
      mark_shape("Dot 1", (0, 0), (300_000, 300_000), None, Some("ellipse")),
      mark_shape(
        "Dot 2",
        (400_000, 0),
        (300_000, 300_000),
        None,
        Some("ellipse"),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_marks(&shapes, &scheme, &map, SLIDE).len(), 0);
  }

  #[test]
  fn excludes_a_lone_small_shape() {
    let shapes = vec![mark_shape(
      "Icon Fragment",
      (0, 0),
      (300_000, 300_000),
      Some(fixed_fill("1F4E79")),
      Some("ellipse"),
    )];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_marks(&shapes, &scheme, &map, SLIDE).len(), 0);
  }

  #[test]
  fn excludes_same_size_shapes_scattered_across_the_slide() {
    // 同一サイズだが対角に散らばっている（背景パターン等）ため近接条件を満たさない
    let shapes = vec![
      mark_shape(
        "Dot 1",
        (0, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
      mark_shape(
        "Dot 2",
        (11_800_000, 6_500_000),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    assert_eq!(classify_marks(&shapes, &scheme, &map, SLIDE).len(), 0);
  }

  #[test]
  fn distinguishes_square_shapes_from_circles() {
    let shapes = vec![
      mark_shape(
        "Square 1",
        (0, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("rect"),
      ),
      mark_shape(
        "Square 2",
        (400_000, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("rect"),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let groups = classify_marks(&shapes, &scheme, &map, SLIDE);
    assert_eq!(groups.len(), 1);
    assert!(groups[0].shapes.iter().all(|s| !s.is_circle));
  }

  #[test]
  fn mark_classification_is_deterministic() {
    let shapes = vec![
      mark_shape(
        "Dot 1",
        (0, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
      mark_shape(
        "Dot 2",
        (400_000, 0),
        (300_000, 300_000),
        Some(fixed_fill("1F4E79")),
        Some("ellipse"),
      ),
    ];
    let scheme = ClrScheme::default();
    let map = ClrMap::default();
    let first = classify_marks(&shapes, &scheme, &map, SLIDE);
    for _ in 0..5 {
      assert_eq!(classify_marks(&shapes, &scheme, &map, SLIDE), first);
    }
  }
}
