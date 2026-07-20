export function getChurchDisplayName(church: { name: string; shortName?: string | null }) {
  const shortName = church.shortName?.trim();
  return shortName || church.name;
}

/** True for the main campus (e.g. "BHCCCI - Main"), not names like "Mainit". */
export function isMainChurchName(name: string | null | undefined) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) return false;
  return (
    normalized === "main" ||
    normalized === "bhccci - main" ||
    normalized === "bhccci-main" ||
    /(?:^|[\s-])main$/.test(normalized)
  );
}

export function compareChurchNamesMainFirst(a: string | { name: string; shortName?: string | null }, b: string | { name: string; shortName?: string | null }) {
  const nameA = typeof a === "string" ? a : getChurchDisplayName(a);
  const nameB = typeof b === "string" ? b : getChurchDisplayName(b);
  const aMain = isMainChurchName(nameA);
  const bMain = isMainChurchName(nameB);
  if (aMain !== bMain) return aMain ? -1 : 1;
  return String(nameA || "").localeCompare(String(nameB || ""), undefined, { sensitivity: "base" });
}

export function sortChurchesMainFirst<T>(items: T[], getName: (item: T) => string = (item) => getChurchDisplayName(item as any)) {
  return [...(items || [])].sort((a, b) => compareChurchNamesMainFirst(getName(a), getName(b)));
}
