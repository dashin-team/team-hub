// 南恩團隊同仁名單。目前先寫在這裡，之後可改由 Supabase 讀取同樣的結構。
// district 是區名，members 依名單順序。rank 只有 UM、SP、CA。

export const ROSTER_RANKS = ["UM", "SP", "CA"];

export const TEAM_ROSTER = [
  { district: "秋慧區", members: [
    { name: "林秋慧", rank: "UM" },
    { name: "林秋速", rank: "CA" },
    { name: "黃明珠", rank: "CA" },
    { name: "陳達夫", rank: "CA" },
    { name: "李健弘", rank: "CA" },
    { name: "劉妍言", rank: "CA" },
    { name: "郭欣怡", rank: "CA" },
  ] },
  { district: "仕翰區", members: [
    { name: "梁仕翰", rank: "SP" },
    { name: "李宜瑾", rank: "CA" },
  ] },
  { district: "富芳區", members: [
    { name: "張富芳", rank: "SP" },
    { name: "劉維迅", rank: "CA" },
  ] },
  { district: "敏瑜區", members: [
    { name: "黃敏瑜", rank: "SP" },
    { name: "古乃友", rank: "CA" },
    { name: "葉浩典", rank: "CA" },
  ] },
  { district: "秀蓮區", members: [
    { name: "林秀蓮", rank: "UM" },
    { name: "陳韋達", rank: "SP" },
    { name: "林柏穎", rank: "CA" },
    { name: "姚睿恩", rank: "CA" },
  ] },
  { district: "榮楷區", members: [
    { name: "蘇榮楷", rank: "SP" },
    { name: "魏君諺", rank: "CA" },
  ] },
  { district: "國維區", members: [
    { name: "李國維", rank: "SP" },
    { name: "施秀涵", rank: "CA" },
  ] },
  { district: "銘旭區", members: [
    { name: "陳銘旭", rank: "UM" },
    { name: "薛淑慧", rank: "SP" },
    { name: "陳姿妗", rank: "CA" },
  ] },
  { district: "欣樺區", members: [
    { name: "林欣樺", rank: "UM" },
    { name: "吳琮翔", rank: "SP" },
    { name: "郭芷淇", rank: "CA" },
    { name: "周文心", rank: "CA" },
    { name: "連依宣", rank: "CA" },
    { name: "何盈瑩", rank: "CA" },
  ] },
  { district: "建州區", members: [
    { name: "林建州", rank: "SP" },
  ] },
  { district: "承翰區", members: [
    { name: "李承翰", rank: "SP" },
    { name: "吳憶汝", rank: "CA" },
  ] },
  { district: "佳欣區", members: [
    { name: "陳佳欣", rank: "SP" },
    { name: "葉雅秀", rank: "CA" },
  ] },
  { district: "欣蘭區", members: [
    { name: "林欣蘭", rank: "SP" },
    { name: "李俊輝", rank: "CA" },
  ] },
];

export function rosterMembers(roster = TEAM_ROSTER) {
  return roster.flatMap((group) => group.members);
}

export function countRanks(members) {
  const counts = { UM: 0, SP: 0, CA: 0 };
  for (const member of members) {
    if (counts[member.rank] != null) counts[member.rank] += 1;
  }
  return { total: members.length, ...counts };
}

export function filterRoster(roster, { query = "", rank = "" } = {}) {
  const text = String(query || "").trim();
  return roster
    .map((group) => ({
      district: group.district,
      members: group.members.filter((member) => {
        if (rank && member.rank !== rank) return false;
        return !text || member.name.includes(text);
      }),
    }))
    .filter((group) => group.members.length > 0);
}
