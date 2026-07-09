import { In, Repository } from "typeorm";
import { ChurchEntity } from "../entities/church.entity";
import { MemberEntity } from "../entities/member.entity";

export async function loadPastorChurchesByMemberId(
  churchesRepo: Repository<ChurchEntity>,
  memberIds: number[]
) {
  if (!memberIds.length) return new Map<number, ChurchEntity>();

  const churches = await churchesRepo.find({ where: { pastorMemberId: In(memberIds) } });
  const map = new Map<number, ChurchEntity>();
  for (const church of churches) {
    if (church.pastorMemberId) map.set(church.pastorMemberId, church);
  }
  return map;
}

export function resolveMemberChurchId(
  member: Pick<MemberEntity, "id" | "churchId">,
  pastorChurchByMemberId: Map<number, ChurchEntity>
) {
  return member.churchId ?? pastorChurchByMemberId.get(member.id)?.id ?? null;
}
