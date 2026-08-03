//! OOXML の色解決（#167）。
//!
//! OOXML の色は「基準色（`a:srgbClr` / `a:sysClr` / `a:schemeClr`）＋ 変換（`a:lumMod` / `a:lumOff` /
//! `a:tint` / `a:shade`）」の組で表される。受け皿（`ThemeData.colors` と CSS 変数）は hex しか受け取れないため、
//! この層で必ず `#rrggbb` に確定させる。
//!
//! `a:schemeClr` は基準色が未確定なので、パース層は `ColorSpec` として積むだけにし、
//! clrMap → clrScheme の 2 段解決は呼び出し側（`brand::resolve_color_spec`）が行う。

/// sRGB の 8bit 3 成分。抽出結果は必ずこの型を経由して `#rrggbb` へ落とす
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb {
  pub r: u8,
  pub g: u8,
  pub b: u8,
}

impl Rgb {
  /// `#rrggbb`（小文字）へ整形する。リポジトリ既存の色表記（`src/data/loader.ts` 等）と揃える
  pub fn to_hex(self) -> String {
    format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
  }
}

/// JSON へは常に `#rrggbb` 文字列として出す（フロントの `ColorPalette` は hex しか受けない）
impl serde::Serialize for Rgb {
  fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(&self.to_hex())
  }
}

/// `a:srgbClr@val` / `a:sysClr@lastClr` の 6 桁 hex をパースする。先頭 `#` は許容し、桁数・文字種が違えば `None`
pub fn parse_hex(value: &str) -> Option<Rgb> {
  let trimmed = value.trim();
  let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
  if hex.len() != 6 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
    return None;
  }
  // 全バイトが ASCII と確認済みなので 2 バイト単位のスライスは文字境界を壊さない
  let component = |at: usize| u8::from_str_radix(&hex[at..at + 2], 16).ok();
  Some(Rgb {
    r: component(0)?,
    g: component(2)?,
    b: component(4)?,
  })
}

/// 色変換（基準色要素の子として現れる調整）。OOXML の 1/1000% 表記は生成時に実数比（`60000` → `0.6`）へ直す
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ColorTransform {
  /// 輝度（HSL の L）へ乗算する
  LumMod(f64),
  /// 輝度（HSL の L）へ加算する
  LumOff(f64),
  /// 白へ寄せる。ECMA-376 の定義では `val` が原色の残存比（10% tint = 原色 10% ＋ 白 90%）
  Tint(f64),
  /// 黒へ寄せる。ECMA-376 の定義では `val` が原色の残存比（10% shade = 原色 10% ＋ 黒 90%）
  Shade(f64),
}

impl ColorTransform {
  /// 要素のローカル名と `val`（1/1000% 表記）から変換を作る。
  /// 対象外の要素・不正値は `None`（`alpha`/`satMod` 等の未知の調整は無視して基準色を残す）
  pub fn from_element(local_name: &str, val: &str) -> Option<Self> {
    let ratio = val.trim().parse::<f64>().ok()? / 100_000.0;
    match local_name {
      "lumMod" => Some(ColorTransform::LumMod(ratio)),
      "lumOff" => Some(ColorTransform::LumOff(ratio)),
      "tint" => Some(ColorTransform::Tint(ratio)),
      "shade" => Some(ColorTransform::Shade(ratio)),
      _ => None,
    }
  }
}

/// 基準色の参照。`Scheme` は clrMap / clrScheme を当てるまで確定しない
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColorRef {
  /// `a:srgbClr@val` / `a:sysClr@lastClr` で確定している色
  Fixed(Rgb),
  /// `a:schemeClr@val`（`bg1` / `tx1` / `accent1` 等）。clrMap → clrScheme の 2 段で解決する
  Scheme(String),
}

/// 未解決の色指定。パース層はこれを積み、解決層が hex へ確定させる
#[derive(Debug, Clone, PartialEq)]
pub struct ColorSpec {
  pub base: ColorRef,
  /// XML の出現順で保持する（順序が変わると別の色になる）
  pub transforms: Vec<ColorTransform>,
}

impl ColorSpec {
  pub fn new(base: ColorRef) -> Self {
    Self {
      base,
      transforms: Vec::new(),
    }
  }
}

/// 変換列を出現順に適用する。
/// `lumMod` → `lumOff` は「L を 60% にしてから 40% 足す」を意味し、逆順に適用すると別の色になるため順序を守る
pub fn apply_transforms(base: Rgb, transforms: &[ColorTransform]) -> Rgb {
  transforms
    .iter()
    .fold(base, |color, transform| match *transform {
      ColorTransform::LumMod(ratio) => map_luminance(color, |l| l * ratio),
      ColorTransform::LumOff(ratio) => map_luminance(color, |l| l + ratio),
      // tint/shade は ECMA-376 の定義どおり線形 RGB 上で混色する（gamma 補正済みの値のまま混ぜると暗部が持ち上がる）
      ColorTransform::Tint(ratio) => map_linear(color, |c| c * ratio + (1.0 - ratio)),
      ColorTransform::Shade(ratio) => map_linear(color, |c| c * ratio),
    })
}

/// HSL の L だけを写して sRGB へ戻す（`lumMod` / `lumOff` 用）
fn map_luminance(color: Rgb, f: impl Fn(f64) -> f64) -> Rgb {
  let (h, s, l) = rgb_to_hsl(color);
  hsl_to_rgb(h, s, f(l).clamp(0.0, 1.0))
}

/// 各チャンネルを線形 RGB へ戻して写し、sRGB へ再エンコードする（`tint` / `shade` 用）
fn map_linear(color: Rgb, f: impl Fn(f64) -> f64) -> Rgb {
  let channel = |v: u8| {
    let linear = srgb_to_linear(f64::from(v) / 255.0);
    to_u8(linear_to_srgb(f(linear).clamp(0.0, 1.0)))
  };
  Rgb {
    r: channel(color.r),
    g: channel(color.g),
    b: channel(color.b),
  }
}

fn srgb_to_linear(c: f64) -> f64 {
  if c <= 0.04045 {
    c / 12.92
  } else {
    ((c + 0.055) / 1.055).powf(2.4)
  }
}

fn linear_to_srgb(c: f64) -> f64 {
  if c <= 0.0031308 {
    c * 12.92
  } else {
    1.055 * c.powf(1.0 / 2.4) - 0.055
  }
}

/// 0.0..=1.0 を 8bit へ丸める（四捨五入・範囲外は端に寄せる）
fn to_u8(v: f64) -> u8 {
  (v * 255.0).round().clamp(0.0, 255.0) as u8
}

/// sRGB → HSL（h は 0.0..1.0 の回転量）
fn rgb_to_hsl(color: Rgb) -> (f64, f64, f64) {
  let r = f64::from(color.r) / 255.0;
  let g = f64::from(color.g) / 255.0;
  let b = f64::from(color.b) / 255.0;
  let max = r.max(g).max(b);
  let min = r.min(g).min(b);
  let l = (max + min) / 2.0;
  let delta = max - min;
  if delta == 0.0 {
    return (0.0, 0.0, l);
  }
  let s = delta / (1.0 - (2.0 * l - 1.0).abs());
  let h = if max == r {
    ((g - b) / delta).rem_euclid(6.0)
  } else if max == g {
    (b - r) / delta + 2.0
  } else {
    (r - g) / delta + 4.0
  };
  (h / 6.0, s, l)
}

/// HSL（h は 0.0..1.0 の回転量）→ sRGB
fn hsl_to_rgb(h: f64, s: f64, l: f64) -> Rgb {
  let chroma = (1.0 - (2.0 * l - 1.0).abs()) * s;
  let sector = h.rem_euclid(1.0) * 6.0;
  let second = chroma * (1.0 - (sector.rem_euclid(2.0) - 1.0).abs());
  let (r, g, b) = match sector as u8 {
    0 => (chroma, second, 0.0),
    1 => (second, chroma, 0.0),
    2 => (0.0, chroma, second),
    3 => (0.0, second, chroma),
    4 => (second, 0.0, chroma),
    _ => (chroma, 0.0, second),
  };
  let offset = l - chroma / 2.0;
  Rgb {
    r: to_u8(r + offset),
    g: to_u8(g + offset),
    b: to_u8(b + offset),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn rgb(r: u8, g: u8, b: u8) -> Rgb {
    Rgb { r, g, b }
  }

  #[test]
  fn parse_hex_accepts_6_digits_and_rejects_others() {
    assert_eq!(parse_hex("4A5356"), Some(rgb(0x4a, 0x53, 0x56)));
    assert_eq!(parse_hex("#f6a21d"), Some(rgb(0xf6, 0xa2, 0x1d)));
    assert_eq!(parse_hex("  FFFFFF  "), Some(rgb(255, 255, 255)));
    // 3 桁短縮・8 桁・非 hex・マルチバイトはすべて拒否する（受け皿は 6 桁 hex しか受けない）
    assert_eq!(parse_hex("fff"), None);
    assert_eq!(parse_hex("FFFFFFFF"), None);
    assert_eq!(parse_hex("gggggg"), None);
    assert_eq!(parse_hex("あかいろ"), None);
  }

  #[test]
  fn to_hex_is_lowercase_and_zero_padded() {
    assert_eq!(rgb(0, 0, 0).to_hex(), "#000000");
    assert_eq!(rgb(0xf6, 0xa2, 0x1d).to_hex(), "#f6a21d");
    assert_eq!(rgb(1, 2, 3).to_hex(), "#010203");
  }

  #[test]
  fn rgb_serializes_as_hex_string() {
    assert_eq!(
      serde_json::to_string(&rgb(0xe8, 0xe3, 0xce)).unwrap(),
      "\"#e8e3ce\""
    );
  }

  #[test]
  fn transform_from_element_converts_thousandths_of_percent() {
    assert_eq!(
      ColorTransform::from_element("lumMod", "60000"),
      Some(ColorTransform::LumMod(0.6))
    );
    assert_eq!(
      ColorTransform::from_element("lumOff", "40000"),
      Some(ColorTransform::LumOff(0.4))
    );
    assert_eq!(
      ColorTransform::from_element("tint", "20000"),
      Some(ColorTransform::Tint(0.2))
    );
    assert_eq!(
      ColorTransform::from_element("shade", "50000"),
      Some(ColorTransform::Shade(0.5))
    );
    // 未知の調整・不正値は無視する（基準色をそのまま残す方が転写事故が小さい）
    assert_eq!(ColorTransform::from_element("alpha", "50000"), None);
    assert_eq!(ColorTransform::from_element("lumMod", "abc"), None);
  }

  #[test]
  fn hsl_round_trip_preserves_color() {
    for color in [
      rgb(0, 0, 0),
      rgb(255, 255, 255),
      rgb(0xf6, 0xa2, 0x1d),
      rgb(0x4a, 0x53, 0x56),
      rgb(0, 0xb0, 0xf0),
    ] {
      let (h, s, l) = rgb_to_hsl(color);
      assert_eq!(
        hsl_to_rgb(h, s, l),
        color,
        "round trip failed for {}",
        color.to_hex()
      );
    }
  }

  #[test]
  fn lum_mod_off_lightens_toward_the_powerpoint_variant() {
    // PowerPoint の「濃い/薄い」バリアントは lumMod → lumOff の順で L を作る。
    // 黒（L=0）に lumMod 0% + lumOff 100% を当てると白になる = 加算が乗算の後に効いている
    let lightened = apply_transforms(
      rgb(0, 0, 0),
      &[ColorTransform::LumMod(0.0), ColorTransform::LumOff(1.0)],
    );
    assert_eq!(lightened, rgb(255, 255, 255));

    // L=0.5 の色に lumMod 60% + lumOff 40% を当てると L = 0.7 になる（色相・彩度は保つ）
    let base = rgb(0x80, 0x00, 0x00);
    let (_, base_s, base_l) = rgb_to_hsl(base);
    assert!((base_l - 0.251).abs() < 0.01);
    let result = apply_transforms(
      base,
      &[ColorTransform::LumMod(0.6), ColorTransform::LumOff(0.4)],
    );
    let (_, s, l) = rgb_to_hsl(result);
    assert!(
      (l - (base_l * 0.6 + 0.4)).abs() < 0.01,
      "L が lumMod→lumOff の順で写っていない: {l}"
    );
    assert!(
      (s - base_s).abs() < 0.05,
      "彩度が保たれていない: {s} vs {base_s}"
    );
  }

  #[test]
  fn tint_and_shade_move_toward_white_and_black() {
    // shade 0% は黒、100% は原色（ECMA-376 は val を原色の残存比と定義する）
    assert_eq!(
      apply_transforms(rgb(0xf6, 0xa2, 0x1d), &[ColorTransform::Shade(0.0)]),
      rgb(0, 0, 0)
    );
    assert_eq!(
      apply_transforms(rgb(0xf6, 0xa2, 0x1d), &[ColorTransform::Shade(1.0)]),
      rgb(0xf6, 0xa2, 0x1d)
    );
    // tint 0% は白、100% は原色
    assert_eq!(
      apply_transforms(rgb(0xf6, 0xa2, 0x1d), &[ColorTransform::Tint(0.0)]),
      rgb(255, 255, 255)
    );
    assert_eq!(
      apply_transforms(rgb(0xf6, 0xa2, 0x1d), &[ColorTransform::Tint(1.0)]),
      rgb(0xf6, 0xa2, 0x1d)
    );
    // 中間は必ず原色より明るい（tint）/ 暗い（shade）
    let tinted = apply_transforms(rgb(0x80, 0x40, 0x20), &[ColorTransform::Tint(0.4)]);
    let shaded = apply_transforms(rgb(0x80, 0x40, 0x20), &[ColorTransform::Shade(0.4)]);
    assert!(tinted.r > 0x80 && tinted.g > 0x40 && tinted.b > 0x20);
    assert!(shaded.r < 0x80 && shaded.g < 0x40 && shaded.b < 0x20);
  }

  #[test]
  fn transforms_are_deterministic() {
    // 同一入力から必ず同一出力になる（受け入れ基準の再現性）
    let transforms = [
      ColorTransform::LumMod(0.75),
      ColorTransform::Tint(0.6),
      ColorTransform::Shade(0.9),
    ];
    let first = apply_transforms(rgb(0x23, 0x88, 0xdd), &transforms);
    for _ in 0..10 {
      assert_eq!(apply_transforms(rgb(0x23, 0x88, 0xdd), &transforms), first);
    }
  }
}
