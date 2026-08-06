/** 英数字以外の連続をハイフンに畳み、前後のハイフンを削る。空になった場合は `fallback` を返す */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}
