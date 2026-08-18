//! EOT（Embedded OpenType）でラップされたフォント実体から sfnt 本体を取り出す（#321 段階1）。
//!
//! OPC（zip + 関係 + content-types）とは無関係な、バイト列そのものに対する独立したバイナリコンテナ形式の
//! パーサなので、`opc.rs`（OPC 部分）とは別モジュールに分離している。呼び出し側（`mod.rs`）が
//! `OpcPackage::read_bytes` で取り出した `ppt/fonts/*.fntdata` のバイト列をここに渡す。

/// EOT ヘッダの固定長部分に持つ、実体抽出に必要な4フィールド分のバイト数
/// （`EOTSize`/`FontDataSize`/`Version`/`Flags` の ULONG ×4）。可変長のフォント名フィールド群
/// （`FamilyName` 等）は読まない。sfnt 本体は仕様上必ず構造体の末尾「`EOTSize - FontDataSize` バイト目から
/// `FontDataSize` バイト」に置かれるため、そこだけ切り出せば済む
const EOT_HEADER_LEN: usize = 16;

/// EOT の ProcessingFlags（`Flags`）における MicroType Express 圧縮ビット（MS-EOT 仕様の `TTEMBED_TTCOMPRESSED`）。
/// 立っている場合、後続のフォントデータは圧縮されていて sfnt マジックが現れない（#321 の段階2対象。
/// 本 issue のスコープ外なので解凍はせず、実体を取り込まず書体名のみへ退避する）
const EOT_FLAG_TTCOMPRESSED: u32 = 0x0000_0004;

fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
  let slice = bytes.get(offset..offset + 4)?;
  Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

/// 先頭4バイトが既知の sfnt マジック（`0x00010000` / `OTTO` / `true` / `ttcf`）のいずれかに一致するか
fn has_sfnt_magic(bytes: &[u8]) -> bool {
  bytes.starts_with(&[0x00, 0x01, 0x00, 0x00])
    || bytes.starts_with(b"OTTO")
    || bytes.starts_with(b"true")
    || bytes.starts_with(b"ttcf")
}

/// フォント実体の content type を sfnt マジックから決める（`OTTO` は CFF アウトラインの OpenType、
/// それ以外の sfnt マジックは TrueType 系として扱う）
pub fn sfnt_content_type(sfnt: &[u8]) -> &'static str {
  if sfnt.starts_with(b"OTTO") {
    "font/otf"
  } else {
    "font/ttf"
  }
}

/// EOT でラップされたフォント実体から sfnt 本体を切り出す（#321 段階1）。
/// 圧縮（MicroType Express）・ヘッダ長不足・`EOTSize`/`FontDataSize` の不整合・sfnt マジック不一致の
/// いずれでも `None`（例外にせず、呼び出し側が書体名のみへ退避する）
pub fn extract_sfnt_from_eot(bytes: &[u8]) -> Option<&[u8]> {
  if bytes.len() < EOT_HEADER_LEN {
    return None;
  }
  let eot_size = read_u32_le(bytes, 0)? as usize;
  let font_data_size = read_u32_le(bytes, 4)? as usize;
  let flags = read_u32_le(bytes, 12)?;
  if flags & EOT_FLAG_TTCOMPRESSED != 0
    || font_data_size == 0
    || eot_size > bytes.len()
    || font_data_size > eot_size
  {
    return None;
  }
  let sfnt = &bytes[eot_size - font_data_size..eot_size];
  has_sfnt_magic(sfnt).then_some(sfnt)
}

/// テスト用の EOT ラッパー（固定16バイトヘッダのみ。可変長のフォント名フィールド群は省略し、sfnt 本体を
/// ヘッダ直後に直接置く最小構成にする）。数値フィールドは ASCII 範囲（0x00-0x7F）に収まる値だけを使い、
/// テストコード上で `&str` リテラルとして扱えるようにする。`mod.rs` の統合テストもこの1つを共有する（#321）
#[cfg(test)]
pub(crate) fn eot_wrapped(sfnt: &str, flags: u32) -> String {
  let font_data_size = sfnt.len() as u32;
  let eot_size = EOT_HEADER_LEN as u32 + font_data_size;
  let mut out = String::new();
  for value in [eot_size, font_data_size, 0x0001_0000, flags] {
    for byte in value.to_le_bytes() {
      assert!(byte <= 0x7f, "テスト用ヘッダは ASCII 範囲に収めること");
      out.push(byte as char);
    }
  }
  out.push_str(sfnt);
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extract_sfnt_from_eot_strips_header_from_uncompressed_font() {
    let eot = eot_wrapped("OTTOfake-cff-outline-data", 0);
    let sfnt = extract_sfnt_from_eot(eot.as_bytes()).expect("非圧縮 EOT は sfnt を取り出せる");
    assert_eq!(sfnt, b"OTTOfake-cff-outline-data");
  }

  #[test]
  fn extract_sfnt_from_eot_recognizes_truetype_magic_variants() {
    for magic in [[0x00u8, 0x01, 0x00, 0x00], *b"true", *b"ttcf"] {
      let mut sfnt_body = magic.to_vec();
      sfnt_body.extend_from_slice(b"-body");
      // マジック4バイトは ASCII 範囲（0x00-0x7F）の値だけを使うので、そのまま char へ写せる
      let sfnt_str: String = sfnt_body.iter().map(|&b| b as char).collect();
      let eot = eot_wrapped(&sfnt_str, 0);
      let sfnt = extract_sfnt_from_eot(eot.as_bytes()).expect("既知の sfnt マジックは受理される");
      assert_eq!(sfnt, sfnt_body.as_slice());
    }
  }

  #[test]
  fn extract_sfnt_from_eot_returns_none_when_microtype_express_bit_is_set() {
    // Flags の bit2（0x4）が MicroType Express 圧縮を示す。sfnt 本体は仕様上現れない前提だが、
    // このテストではフラグ判定だけを見るためダミーの `OTTO` 本体を置く
    let eot = eot_wrapped("OTTOcompressed-body-is-opaque", EOT_FLAG_TTCOMPRESSED);
    assert_eq!(extract_sfnt_from_eot(eot.as_bytes()), None);
  }

  #[test]
  fn extract_sfnt_from_eot_returns_none_for_header_shorter_than_16_bytes() {
    assert_eq!(extract_sfnt_from_eot(b"too-short"), None);
  }

  #[test]
  fn extract_sfnt_from_eot_returns_none_when_sizes_are_inconsistent() {
    // EOTSize が実際のバイト列より大きい壊れたヘッダ
    let mut broken = eot_wrapped("OTTOfake-cff-outline-data", 0);
    broken.truncate(EOT_HEADER_LEN + 4);
    assert_eq!(extract_sfnt_from_eot(broken.as_bytes()), None);
  }

  #[test]
  fn extract_sfnt_from_eot_returns_none_when_magic_does_not_match() {
    let eot = eot_wrapped("NOPEnot-a-real-sfnt-body", 0);
    assert_eq!(extract_sfnt_from_eot(eot.as_bytes()), None);
  }

  #[test]
  fn sfnt_content_type_distinguishes_opentype_cff_from_truetype() {
    assert_eq!(sfnt_content_type(b"OTTOxxxx"), "font/otf");
    assert_eq!(sfnt_content_type(b"\x00\x01\x00\x00xxxx"), "font/ttf");
    assert_eq!(sfnt_content_type(b"truexxxx"), "font/ttf");
  }
}
