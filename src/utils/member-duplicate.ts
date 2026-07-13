export function normalizeMemberName(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim().toLowerCase().replace(/\s+/g, " ");
  const last = lastName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!first || !last) return null;
  return `${last}|${first}`;
}

export function formatMemberDisplayName(firstName: string, lastName: string) {
  return `${lastName}, ${firstName}`;
}

export type MemberDuplicateIndex = {
  names: Map<string, string>;
};

export function buildMemberDuplicateIndex(
  members: Array<{ firstName: string; lastName: string }>
): MemberDuplicateIndex {
  const names = new Map<string, string>();

  for (const member of members) {
    const name = normalizeMemberName(member.firstName, member.lastName);
    if (!name) continue;
    names.set(name, formatMemberDisplayName(member.firstName, member.lastName));
  }

  return { names };
}

export function findMemberDuplicate(
  member: { firstName: string; lastName: string },
  existing: MemberDuplicateIndex,
  batchNames: Map<string, number>,
  rowNumber: number
): string | null {
  const name = normalizeMemberName(member.firstName, member.lastName);
  if (!name) return null;

  const batchRow = batchNames.get(name);
  if (batchRow != null && batchRow !== rowNumber) {
    return `Duplicate name in this file (same as row ${batchRow}).`;
  }

  const existingName = existing.names.get(name);
  if (existingName) {
    return `A member with this name already exists (${existingName}).`;
  }

  return null;
}

export function registerMemberDuplicateName(
  member: { firstName: string; lastName: string },
  existing: MemberDuplicateIndex,
  batchNames: Map<string, number>,
  rowNumber: number
) {
  const name = normalizeMemberName(member.firstName, member.lastName);
  if (!name) return;

  batchNames.set(name, rowNumber);
  existing.names.set(name, formatMemberDisplayName(member.firstName, member.lastName));
}
