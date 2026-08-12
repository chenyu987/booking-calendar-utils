// 年龄只存生日、用的时候算，这样不会随时间过期
export function calcAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();

  // 今年生日还没过就减一岁
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

// 显示成「男 26岁」，匹配时一眼能看出物品对不对得上
export function formatHolder(
  gender?: string | null,
  dateOfBirth?: string | null
): string {
  const genderLabel = gender === "male" ? "男" : gender === "female" ? "女" : "";
  const age = calcAge(dateOfBirth);
  const ageLabel = age !== null ? `${age}岁` : "";

  const parts = [genderLabel, ageLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "-";
}
