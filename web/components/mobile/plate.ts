/** Turkish plates: province 01–81, one to three letters (no Q, W, X), two to four digits. */
const LETTERS = "ABCDEFGHIJKLMNOPRSTUVYZ";

export type PlateParts = { province: string; letters: string; digits: string };

export const cleanPlate = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function splitPlate(raw: string): PlateParts {
  const m = cleanPlate(raw).match(/^(\d{0,2})([A-Z]{0,3})(\d{0,4})/);
  return { province: m?.[1] ?? "", letters: m?.[2] ?? "", digits: m?.[3] ?? "" };
}

export const joinPlate = (p: PlateParts) => `${p.province}${p.letters}${p.digits}`;

export const formatPlate = (raw: string) => {
  const p = splitPlate(raw);
  return [p.province, p.letters, p.digits].filter(Boolean).join(" ");
};

export function isValidPlate(raw: string) {
  const v = cleanPlate(raw);
  const m = v.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
  if (!m) return false;
  const province = Number(m[1]);
  return province >= 1 && province <= 81 && [...m[2]].every((c) => LETTERS.includes(c));
}

export const onlyPlateLetters = (raw: string) =>
  [...raw.toUpperCase()].filter((c) => LETTERS.includes(c)).join("");
