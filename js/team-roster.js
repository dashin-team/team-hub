import { GRADE_SORT, MEMBER_GRADES, gradeTitle } from "./metrics.js";

// 示範用同仁名單。名字都是虛構的。
// 雲端模式改呼叫 Supabase 的 team_roster()，不要把真實姓名寫回這個檔案。

export const ROSTER_RANKS = MEMBER_GRADES;

export const TEAM_ROSTER = [
  { district: "示範一區", members: [
    { name: "王示範", rank: "UM" },
    { name: "陳小安", rank: "CA" },
    { name: "林小弟", rank: "AM" },
  ] },
  { district: "示範二區", members: [
    { name: "張主管", rank: "SP" },
    { name: "李新人", rank: "CA" },
  ] },
  { district: "示範三區", members: [
    { name: "周示範", rank: "DM" },
  ] },
];

export function rosterMembers(roster = TEAM_ROSTER) {
  return roster.flatMap((group) => group.members);
}

export function countRanks(members) {
  const counts = Object.fromEntries(ROSTER_RANKS.map((rank) => [rank, 0]));
  for (const member of members) {
    if (counts[member.rank] != null) counts[member.rank] += 1;
  }
  return { total: members.length, ...counts };
}

export function groupRoster(rows) {
  const people = (rows || []).filter((row) => row.grade && row.grade !== "ADMIN");
  const sorted = [...people].sort((a, b) => {
    const zone = (a.zone_order ?? 999) - (b.zone_order ?? 999);
    if (zone) return zone;
    const grade = (GRADE_SORT[a.grade] ?? 9) - (GRADE_SORT[b.grade] ?? 9);
    if (grade) return grade;
    return String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-Hant");
  });
  const groups = [];
  const seen = new Map();
  for (const row of sorted) {
    const district = row.zone || "未分區";
    if (!seen.has(district)) {
      const group = { district, members: [] };
      seen.set(district, group);
      groups.push(group);
    }
    seen.get(district).members.push({
      id: row.id || "",
      name: row.display_name,
      rank: row.grade,
      role: row.role || "",
      lastSignIn: row.last_sign_in_at ?? null,
    });
  }
  return groups;
}

export function filterRoster(roster, { query = "", rank = "" } = {}) {
  const text = String(query || "").trim();
  return roster
    .map((group) => ({
      district: group.district,
      members: group.members.filter((member) => {
        if (rank && member.rank !== rank) return false;
        return !text || String(member.name || "").includes(text);
      }),
    }))
    .filter((group) => group.members.length > 0);
}
