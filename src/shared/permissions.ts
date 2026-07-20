export const USER_TAGS = {
  SUPER_USER: "Super User",
  EXECUTIVE_PASTOR: "Executive Pastor",
  PASTOR: "Pastor",
  LIFE_COACH: "Life Coach",
  MAIN_CHURCH_ADMIN: "Main Church Admin",
  EVENTS_MANAGER: "Events Manager"
} as const;

export type UserTagName = (typeof USER_TAGS)[keyof typeof USER_TAGS];

export const ALL_USER_TAGS: UserTagName[] = Object.values(USER_TAGS);

export const FULL_ACCESS_TAGS: UserTagName[] = [
  USER_TAGS.SUPER_USER,
  USER_TAGS.EXECUTIVE_PASTOR,
  USER_TAGS.MAIN_CHURCH_ADMIN
];

export const USER_MANAGEMENT_TAGS: UserTagName[] = FULL_ACCESS_TAGS;

export function hasFullAccess(tags: string[]): boolean {
  return tags.some((t) => FULL_ACCESS_TAGS.includes(t as UserTagName));
}

export function hasAnyTag(tags: string[], required: string[]): boolean {
  if (hasFullAccess(tags)) return true;
  return required.some((r) => tags.includes(r));
}

export function canManageUsers(tags: string[]): boolean {
  return hasAnyTag(tags, USER_MANAGEMENT_TAGS);
}

export const PAGE_PERMISSIONS: Record<string, string[]> = {
  dashboard: ALL_USER_TAGS,
  members: [
    USER_TAGS.SUPER_USER,
    USER_TAGS.EXECUTIVE_PASTOR,
    USER_TAGS.MAIN_CHURCH_ADMIN,
    USER_TAGS.PASTOR,
    USER_TAGS.LIFE_COACH,
    USER_TAGS.EVENTS_MANAGER
  ],
  churches: [USER_TAGS.SUPER_USER, USER_TAGS.EXECUTIVE_PASTOR, USER_TAGS.MAIN_CHURCH_ADMIN, USER_TAGS.PASTOR],
  lifegroups: [USER_TAGS.SUPER_USER, USER_TAGS.EXECUTIVE_PASTOR, USER_TAGS.MAIN_CHURCH_ADMIN, USER_TAGS.PASTOR, USER_TAGS.LIFE_COACH],
  events: [
    USER_TAGS.SUPER_USER,
    USER_TAGS.EXECUTIVE_PASTOR,
    USER_TAGS.MAIN_CHURCH_ADMIN,
    USER_TAGS.PASTOR,
    USER_TAGS.EVENTS_MANAGER
  ],
  operations: [USER_TAGS.SUPER_USER, USER_TAGS.EXECUTIVE_PASTOR, USER_TAGS.MAIN_CHURCH_ADMIN],
  attendance: [USER_TAGS.SUPER_USER, USER_TAGS.EXECUTIVE_PASTOR, USER_TAGS.MAIN_CHURCH_ADMIN, USER_TAGS.PASTOR, USER_TAGS.LIFE_COACH],
  users: USER_MANAGEMENT_TAGS,
  tags: USER_MANAGEMENT_TAGS
};

export function canAccessPage(tags: string[], page: string): boolean {
  const required = PAGE_PERMISSIONS[page];
  if (!required) return false;
  return hasAnyTag(tags, required);
}

export interface AuthUser {
  id: number;
  fullName: string;
  username: string;
  tags: string[];
  churchId: number | null;
  memberId: number | null;
}
