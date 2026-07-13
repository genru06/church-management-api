import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TagEntity } from "../../entities/tag.entity";
import { AuthUser, canManageUsers } from "../../shared/permissions";

@Injectable()
export class TagsService {
  constructor(@InjectRepository(TagEntity) private readonly tagsRepo: Repository<TagEntity>) {}

  async list() {
    return this.tagsRepo.find({ order: { name: "ASC" } });
  }

  async create(actor: AuthUser, body: any) {
    this.assertCanManage(actor);
    const name = String(body?.name || "").trim();
    if (!name) throw new ConflictException("Tag name is required");

    const existing = await this.tagsRepo.findOne({ where: { name } });
    if (existing) throw new ConflictException("A tag with this name already exists");

    return this.tagsRepo.save(this.tagsRepo.create({ name }));
  }

  async remove(actor: AuthUser, id: number) {
    this.assertCanManage(actor);
    const tag = await this.tagsRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException("Tag not found");
    await this.tagsRepo.delete({ id });
    return { id, deleted: true };
  }

  private assertCanManage(actor: AuthUser) {
    if (!canManageUsers(actor.tags)) throw new ForbiddenException("You do not have permission to manage tags");
  }
}
