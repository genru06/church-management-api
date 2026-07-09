import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { In, Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { UserAccessTagEntity } from "../../entities/user-access-tag.entity";
import { UserTagEntity } from "../../entities/user-tag.entity";
import { AuthUser, canManageUsers } from "../../shared/permissions";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(UserAccessTagEntity) private readonly tagsRepo: Repository<UserAccessTagEntity>,
    @InjectRepository(UserTagEntity) private readonly userTagsRepo: Repository<UserTagEntity>
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

  private toDto(user: UserEntity, tags: string[]) {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      tags,
      churchId: user.churchId,
      memberId: user.memberId,
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
    const result = [];
    for (const user of users) {
      const tags = await this.loadUserTags(user.id);
      result.push(this.toDto(user, tags));
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
    const memberId = body?.memberId ? Number(body.memberId) : null;

    if (!username || !fullName || !password) throw new ConflictException("Full name, username, and password are required");
    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) throw new ConflictException("A user with this username already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersRepo.save(
      this.usersRepo.create({ fullName, username, passwordHash, churchId, memberId, isActive: true })
    );
    await this.setUserTags(user.id, tags);
    return this.toDto(user, await this.loadUserTags(user.id));
  }

  async update(actor: AuthUser, id: number, body: any) {
    this.assertCanManage(actor);
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (body?.fullName) user.fullName = String(body.fullName).trim();
    if (body?.username) user.username = String(body.username).trim().toLowerCase();
    if (body?.password) user.passwordHash = await bcrypt.hash(String(body.password), 10);
    if (body?.churchId !== undefined) user.churchId = body.churchId ? Number(body.churchId) : null;
    if (body?.memberId !== undefined) user.memberId = body.memberId ? Number(body.memberId) : null;
    if (body?.isActive !== undefined) user.isActive = Boolean(body.isActive);

    await this.usersRepo.save(user);
    if (body?.tags) await this.setUserTags(user.id, body.tags);
    return this.toDto(user, await this.loadUserTags(user.id));
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
