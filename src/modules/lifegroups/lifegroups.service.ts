import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { MemberEntity } from "../../entities/member.entity";
import { LifeGroupMemberEntity } from "../../entities/lifegroup-member.entity";

@Injectable()
export class LifeGroupsService {
  constructor(
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>,
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(LifeGroupMemberEntity) private readonly lifeGroupMembersRepo: Repository<LifeGroupMemberEntity>
  ) {}

  async add(body: any) {
    const saved = await this.lifeGroupsRepo.save(
      this.lifeGroupsRepo.create({
        name: body.name,
        coachMemberId: Number(body.coachMemberId),
        churchId: body.churchId || null
      })
    );
    return this.view(saved.id);
  }

  async list() {
    const rows = await this.lifeGroupsRepo.find({ order: { id: "DESC" } });
    const members = await this.membersRepo.find();
    const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    return rows.map((g) => ({
      ...g,
      coachName: nameById.get(g.coachMemberId) || "-"
    }));
  }

  async view(id: number) {
    const row = await this.lifeGroupsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("LifeGroup not found");
    const coach = await this.membersRepo.findOne({ where: { id: row.coachMemberId } });

    const links = await this.lifeGroupMembersRepo.find({ where: { lifeGroupId: id } });
    const ids = links.map((l) => l.memberId);
    const linkedMembers = ids.length ? await this.membersRepo.findBy(ids.map((memberId) => ({ id: memberId }))) : [];
    const memberNameById = new Map(linkedMembers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    const mappedMembers = links.map((link) => ({
      id: link.memberId,
      parentMemberId: link.parentMemberId,
      name: memberNameById.get(link.memberId) || "Unknown Member",
      tags: [] as string[]
    }));

    const memberIds = [row.coachMemberId, ...ids].filter(Boolean);
    const tagMap = await this.loadMemberTags(memberIds);

    return {
      ...row,
      coachId: row.coachMemberId,
      coachName: coach ? `${coach.firstName} ${coach.lastName}` : "-",
      coachTags: coach ? tagMap.get(coach.id) || [] : [],
      members: mappedMembers.map((member) => ({
        ...member,
        tags: tagMap.get(member.id) || []
      }))
    };
  }

  private async loadMemberTags(memberIds: number[]) {
    const map = new Map<number, string[]>();
    if (!memberIds.length) return map;

    const placeholders = memberIds.map(() => "?").join(", ");
    const rows: { memberId: number; name: string }[] = await this.lifeGroupMembersRepo.query(
      `SELECT mt.member_id AS memberId, t.name AS name
       FROM member_tag mt
       INNER JOIN tag t ON t.id = mt.tag_id
       WHERE mt.member_id IN (${placeholders})`,
      memberIds
    );

    rows.forEach((row) => {
      const existing = map.get(Number(row.memberId)) || [];
      existing.push(row.name);
      map.set(Number(row.memberId), existing);
    });
    return map;
  }

  async addMember(lifeGroupId: number, body: any) {
    const group = await this.lifeGroupsRepo.findOne({ where: { id: lifeGroupId } });
    if (!group) throw new NotFoundException("LifeGroup not found");
    if (!body?.memberId) throw new NotFoundException("memberId is required");

    const memberId = Number(body.memberId);
    const member = await this.membersRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException("Member not found");
    if (memberId === group.coachMemberId) {
      throw new ConflictException("Coach is already the lifegroup leader");
    }

    const existing = await this.lifeGroupMembersRepo.findOne({
      where: { lifeGroupId, memberId }
    });
    if (existing) throw new ConflictException("Member is already in this lifegroup");

    const parentMemberId = body.parentMemberId ? Number(body.parentMemberId) : group.coachMemberId;
    await this.lifeGroupMembersRepo.save(
      this.lifeGroupMembersRepo.create({
        lifeGroupId,
        memberId,
        parentMemberId
      })
    );
    return this.view(lifeGroupId);
  }

  async edit(id: number, body: any) {
    const existing = await this.lifeGroupsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("LifeGroup not found");
    await this.lifeGroupsRepo.update(id, {
      name: body.name,
      coachMemberId: Number(body.coachMemberId),
      churchId: body.churchId || null
    });
    return this.view(id);
  }

  async remove(id: number) {
    const existing = await this.lifeGroupsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("LifeGroup not found");
    await this.lifeGroupMembersRepo.delete({ lifeGroupId: id });
    await this.lifeGroupsRepo.delete(id);
    return { id, deleted: true };
  }
}
