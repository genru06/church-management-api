import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { In, Not, Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { UserAccessTagEntity } from "../../entities/user-access-tag.entity";
import { UserTagEntity } from "../../entities/user-tag.entity";
import { MemberEntity } from "../../entities/member.entity";
import { AuthUser, canManageUsers } from "../../shared/permissions";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(UserAccessTagEntity) private readonly tagsRepo: Repository<UserAccessTagEntity>,
    @InjectRepository(UserTagEntity) private readonly userTagsRepo: Repository<UserTagEntity>,
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>
  ) {}

  private assertCanManage(actor: AuthUser) {
    if (!canManageUsers(actor.tags)) throw new ForbiddenException("You do not have permission to manage users");
  }

  private async loadUserTags(userId: number): Promise<string[]> {
    const rows = await this.userTagsRepo
      .createQueryBuilder("ut")
      .innerJoin(UserAccessTagEntity, "t", "t.id = ut.tag_id")
      .select("t.name", "name")
      .where("ut.user_id = :userId", { userId })
      .getRawMany<{ name: string }>();
    return rows.map((r) => r.name);
  }

  private async setUserTags(userId: number, tagNames: string[]) {
    await this.userTagsRepo.delete({ userId });
    if (!tagNames?.length) return;

    const tags = await this.tagsRepo.find({ where: { name: In(tagNames) } });
    const assignments = tags.map((t) => this.userTagsRepo.create({ userId, tagId: t.id }));
    if (assignments.length) await this.userTagsRepo.save(assignments);
  }

  private memberDisplayName(member: MemberEntity | null | undefined) {
    if (!member) return null;
    return `${member.firstName} ${member.lastName}`.trim();
  }

  private async resolveMember(memberId: number | null, excludeUserId?: number) {
    if (!memberId) return { memberId: null as number | null, member: null as MemberEntity | null };

    const member = await this.membersRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException("Linked member not found");

    const existingUser = await this.usersRepo.findOne({
      where: excludeUserId
        ? { memberId, id: Not(excludeUserId) }
        : { memberId }
    });
    if (existingUser) {
      throw new ConflictException("This member is already linked to another user account");
    }

    return { memberId, member };
  }

  private toDto(user: UserEntity, tags: string[], memberName: string | null = null) {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      tags,
      churchId: user.churchId,
      memberId: user.memberId,
      memberName,
      isActive: Boolean(user.isActive)
    };
  }

  async listTags() {
    const tags = await this.tagsRepo.find({ order: { name: "ASC" } });
    return tags.map((t) => t.name);
  }

  async list(actor: AuthUser) {
    this.assertCanManage(actor);
    const users = await this.usersRepo.find({ order: { fullName: "ASC" } });
    const memberIds = [...new Set(users.map((u) => u.memberId).filter(Boolean))] as number[];
    const members = memberIds.length
      ? await this.membersRepo.find({ where: { id: In(memberIds) } })
      : [];
    const memberNameById = new Map(members.map((m) => [Number(m.id), this.memberDisplayName(m)]));

    const result = [];
    for (const user of users) {
      const tags = await this.loadUserTags(user.id);
      const memberName = user.memberId ? memberNameById.get(Number(user.memberId)) || null : null;
      result.push(this.toDto(user, tags, memberName));
    }
    return result;
  }

  async create(actor: AuthUser, body: any) {
    this.assertCanManage(actor);
    const username = String(body?.username || "").trim().toLowerCase();
    const fullName = String(body?.fullName || "").trim();
    const password = String(body?.password || "");
    const tags: string[] = body?.tags || [];
    const churchId = body?.churchId ? Number(body.churchId) : null;
    const requestedMemberId = body?.memberId ? Number(body.memberId) : null;

    if (!username || !fullName || !password) throw new ConflictException("Full name, username, and password are required");
    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) throw new ConflictException("A user with this username already exists");

    const { memberId, member } = await this.resolveMember(requestedMemberId);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        fullName,
        username,
        passwordHash,
        churchId: churchId ?? member?.churchId ?? null,
        memberId,
        isActive: true
      })
    );
    await this.setUserTags(user.id, tags);
    return this.toDto(user, await this.loadUserTags(user.id), this.memberDisplayName(member));
  }

  async update(actor: AuthUser, id: number, body: any) {
    this.assertCanManage(actor);
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (body?.fullName) user.fullName = String(body.fullName).trim();
    if (body?.username) user.username = String(body.username).trim().toLowerCase();
    if (body?.password) user.passwordHash = await bcrypt.hash(String(body.password), 10);
    if (body?.churchId !== undefined) user.churchId = body.churchId ? Number(body.churchId) : null;
    if (body?.isActive !== undefined) user.isActive = Boolean(body.isActive);

    let linkedMember: MemberEntity | null = null;
    if (body?.memberId !== undefined) {
      const resolved = await this.resolveMember(body.memberId ? Number(body.memberId) : null, id);
      user.memberId = resolved.memberId;
      linkedMember = resolved.member;
      if (resolved.member && body?.churchId === undefined && !user.churchId) {
        user.churchId = resolved.member.churchId ?? null;
      }
    }

    await this.usersRepo.save(user);
    if (body?.tags) await this.setUserTags(user.id, body.tags);

    if (!linkedMember && user.memberId) {
      linkedMember = await this.membersRepo.findOne({ where: { id: user.memberId } });
    }
    return this.toDto(user, await this.loadUserTags(user.id), this.memberDisplayName(linkedMember));
  }

  async remove(actor: AuthUser, id: number) {
    this.assertCanManage(actor);
    if (actor.id === id) throw new ForbiddenException("You cannot delete your own account");
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    await this.userTagsRepo.delete({ userId: id });
    await this.usersRepo.delete({ id });
    return { ok: true };
  }
}
