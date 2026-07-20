import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AclResourceEntity } from "../../entities/acl-resource.entity";
import { TagAclEntity } from "../../entities/tag-acl.entity";
import { UserAccessTagEntity } from "../../entities/user-access-tag.entity";
import { UserTagEntity } from "../../entities/user-tag.entity";
import { AuthUser, canManageAcl, USER_TAGS } from "../../shared/permissions";

const PROTECTED_TAGS = new Set<string>([USER_TAGS.SUPER_USER]);

@Injectable()
export class AclService {
  constructor(
    @InjectRepository(AclResourceEntity) private readonly resourcesRepo: Repository<AclResourceEntity>,
    @InjectRepository(TagAclEntity) private readonly tagAclRepo: Repository<TagAclEntity>,
    @InjectRepository(UserAccessTagEntity) private readonly tagsRepo: Repository<UserAccessTagEntity>,
    @InjectRepository(UserTagEntity) private readonly userTagsRepo: Repository<UserTagEntity>
  ) {}

  private assertCanManage(actor: AuthUser) {
    if (!canManageAcl(actor.tags)) {
      throw new ForbiddenException("Only Super User and Main Church Admin can manage ACL");
    }
  }

  async listResources() {
    const rows = await this.resourcesRepo.find({ order: { sortOrder: "ASC", id: "ASC" } });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      kind: r.kind,
      module: r.module,
      sortOrder: r.sortOrder
    }));
  }

  async listTagsWithPermissions(actor: AuthUser) {
    this.assertCanManage(actor);
    const tags = await this.tagsRepo.find({ order: { name: "ASC" } });
    const resources = await this.resourcesRepo.find();
    const resourceById = new Map(resources.map((r) => [Number(r.id), r.key]));
    const links = await this.tagAclRepo.find();
    const keysByTag = new Map<number, string[]>();

    for (const link of links) {
      const key = resourceById.get(Number(link.resourceId));
      if (!key) continue;
      const tagId = Number(link.tagId);
      if (!keysByTag.has(tagId)) keysByTag.set(tagId, []);
      keysByTag.get(tagId)!.push(key);
    }

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      protected: PROTECTED_TAGS.has(tag.name),
      permissions: (keysByTag.get(Number(tag.id)) || []).sort()
    }));
  }

  async createTag(actor: AuthUser, body: any) {
    this.assertCanManage(actor);
    const name = String(body?.name || "").trim();
    if (!name) throw new BadRequestException("Tag name is required");
    if (name.length > 100) throw new BadRequestException("Tag name is too long");

    const existing = await this.tagsRepo.findOne({ where: { name } });
    if (existing) throw new ConflictException("An access tag with this name already exists");

    const tag = await this.tagsRepo.save(this.tagsRepo.create({ name }));
    return {
      id: tag.id,
      name: tag.name,
      protected: false,
      permissions: [] as string[]
    };
  }

  async removeTag(actor: AuthUser, id: number) {
    this.assertCanManage(actor);
    const tag = await this.tagsRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException("Access tag not found");
    if (PROTECTED_TAGS.has(tag.name)) {
      throw new ForbiddenException("This access tag cannot be deleted");
    }

    const assigned = await this.userTagsRepo.count({ where: { tagId: id } });
    if (assigned > 0) {
      throw new ConflictException("Cannot delete an access tag that is assigned to users");
    }

    await this.tagAclRepo.delete({ tagId: id });
    await this.tagsRepo.delete({ id });
    return { ok: true };
  }

  async setTagPermissions(actor: AuthUser, tagId: number, body: any) {
    this.assertCanManage(actor);
    const tag = await this.tagsRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException("Access tag not found");
    if (PROTECTED_TAGS.has(tag.name)) {
      throw new ForbiddenException("Super User permissions cannot be changed");
    }

    const keys: string[] = Array.isArray(body?.permissions)
      ? body.permissions.map((k: unknown) => String(k).trim()).filter(Boolean)
      : [];

    const resources = keys.length
      ? await this.resourcesRepo.find({ where: { key: In(keys) } })
      : [];

    if (resources.length !== keys.length) {
      const found = new Set(resources.map((r) => r.key));
      const missing = keys.filter((k) => !found.has(k));
      throw new BadRequestException(`Unknown permission keys: ${missing.join(", ")}`);
    }

    await this.tagAclRepo.delete({ tagId });
    if (resources.length) {
      await this.tagAclRepo.save(
        resources.map((r) => this.tagAclRepo.create({ tagId, resourceId: r.id }))
      );
    }

    return {
      id: tag.id,
      name: tag.name,
      protected: false,
      permissions: resources.map((r) => r.key).sort()
    };
  }

  async resolvePermissionsForTags(tagNames: string[]): Promise<string[]> {
    if (!tagNames?.length) return [];
    if (tagNames.includes(USER_TAGS.SUPER_USER)) {
      const all = await this.resourcesRepo.find({ select: ["key"] });
      return all.map((r) => r.key).sort();
    }

    const tags = await this.tagsRepo.find({ where: { name: In(tagNames) } });
    if (!tags.length) return [];

    const tagIds = tags.map((t) => t.id);
    const rows = await this.tagAclRepo
      .createQueryBuilder("ta")
      .innerJoin(AclResourceEntity, "r", "r.id = ta.resource_id")
      .select("DISTINCT r.key", "key")
      .where("ta.tag_id IN (:...tagIds)", { tagIds })
      .getRawMany<{ key: string }>();

    return rows.map((r) => r.key).sort();
  }

  async overview(actor: AuthUser) {
    this.assertCanManage(actor);
    const [resources, tags] = await Promise.all([
      this.listResources(),
      this.listTagsWithPermissions(actor)
    ]);
    return { resources, tags };
  }
}
