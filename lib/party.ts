// 把 male_count / female_count 显示成「2男1女」这种，跟现在 Sheet 里的写法一致
export function formatParty(
  maleCount?: number | null,
  femaleCount?: number | null
): string {
  const male = maleCount ?? 0;
  const female = femaleCount ?? 0;
  const parts: string[] = [];
  if (male > 0) parts.push(`${male}男`);
  if (female > 0) parts.push(`${female}女`);
  return parts.length > 0 ? parts.join("") : "-";
}
