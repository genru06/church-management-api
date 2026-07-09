export function getChurchDisplayName(church: { name: string; shortName?: string | null }) {
  const shortName = church.shortName?.trim();
  return shortName || church.name;
}
