import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Like, Repository } from "typeorm";
import { MemberEntity } from "../../entities/member.entity";
import { MemberTagEntity } from "../../entities/member-tag.entity";
import { TagEntity } from "../../entities/tag.entity";
import { CityEntity } from "../../entities/city.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { getChurchDisplayName } from "../../utils/church-display";
import { loadPastorChurchesByMemberId, resolveMemberChurchId } from "../../utils/member-church";
import {
  buildMemberDuplicateIndex,
  findMemberDuplicate,
  registerMemberDuplicateName
} from "../../utils/member-duplicate";

export const MEMBER_BULK_TEMPLATE_SIGNATURE = "LIFEGROUP_MEMBER_BULK_V1";
export const MEMBER_BULK_TEMPLATE_SIGNATURE_V2 = "LIFEGROUP_MEMBER_BULK_V2";
export const MEMBER_BULK_TEMPLATE_SIGNATURE_V3 = "LIFEGROUP_MEMBER_BULK_V3";

const VALID_MEMBER_BULK_SIGNATURES = new Set([
  MEMBER_BULK_TEMPLATE_SIGNATURE,
  MEMBER_BULK_TEMPLATE_SIGNATURE_V2,
  MEMBER_BULK_TEMPLATE_SIGNATURE_V3
]);

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(MemberTagEntity) private readonly memberTagsRepo: Repository<MemberTagEntity>,
    @InjectRepository(TagEntity) private readonly tagsRepo: Repository<TagEntity>,
    @InjectRepository(CityEntity) private readonly citiesRepo: Repository<CityEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>
  ) {}

  async add(body: any) {
    if (!body?.firstName || !body?.lastName) {
      throw new NotFoundException("firstName and lastName are required");
    }
    const churchId = await this.resolveChurchId(body.churchId);
    const saved = await this.membersRepo.save(
      this.membersRepo.create({
        lastName: body.lastName,
        firstName: body.firstName,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        cityId: body.cityId ? Number(body.cityId) : null,
        barangay: body.barangay || null,
        zip: body.zip || null,
        country: body.country || null,
        dateOfBirth: body.dateOfBirth || null,
        gender: body.gender?.trim() || "",
        maritalStatus: body.maritalStatus || null,
        nationality: body.nationality || null,
        churchId
      })
    );
    await this.setMemberTags(saved.id, body.tags);
    return this.view(saved.id);
  }

  async list(search?: string, tag?: string) {
    const qb = this.membersRepo.createQueryBuilder("member")
      .orderBy("member.lastName", "ASC")
      .addOrderBy("member.firstName", "ASC");
    const term = search?.trim();
    if (term) {
      qb.andWhere("(member.firstName LIKE :term OR member.lastName LIKE :term)", { term: `%${term}%` });
    }

    const tagTerm = tag?.trim();
    if (tagTerm) {
      const taggedIds = await this.getMemberIdsByTagName(tagTerm);
      if (!taggedIds.length) return [];
      qb.andWhere("member.id IN (:...taggedIds)", { taggedIds });
    }

    const rows = await qb.getMany();
    const memberIds = rows.map((row) => Number(row.id));
    const tagMap = await this.loadMemberTags(memberIds);
    const pastorChurchByMemberId = await loadPastorChurchesByMemberId(this.churchesRepo, memberIds);
    const cityIds = [...new Set(rows.map((row) => row.cityId).filter(Boolean))];
    const churchIds = [
      ...new Set(
        [
          ...rows.map((row) => row.churchId),
          ...[...pastorChurchByMemberId.values()].map((church) => church.id)
        ].filter(Boolean) as number[]
      )
    ];
    const cities = cityIds.length ? await this.citiesRepo.findBy(cityIds.map((id) => ({ id }))) : [];
    const churches = churchIds.length ? await this.churchesRepo.find({ where: { id: In(churchIds) } }) : [];
    const cityMap = new Map(cities.map((city) => [city.id, city.munCity]));
    const churchMap = new Map(churches.map((church) => [church.id, getChurchDisplayName(church)]));

    return rows.map((row) => {
      const churchId = resolveMemberChurchId(row, pastorChurchByMemberId);
      return {
        ...row,
        churchId,
        city: row.cityId ? cityMap.get(row.cityId) || null : null,
        church: churchId ? churchMap.get(churchId) || null : null,
        tags: tagMap.get(Number(row.id)) || []
      };
    });
  }

  async view(id: number) {
    const row = await this.membersRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Member not found");
    const city = row.cityId ? await this.citiesRepo.findOne({ where: { id: row.cityId } }) : null;
    const pastorChurchByMemberId = await loadPastorChurchesByMemberId(this.churchesRepo, [id]);
    const churchId = resolveMemberChurchId(row, pastorChurchByMemberId);
    const church = churchId ? await this.churchesRepo.findOne({ where: { id: churchId } }) : null;
    return {
      ...row,
      churchId,
      city: city?.munCity || null,
      church: church ? getChurchDisplayName(church) : null,
      tags: (await this.loadMemberTags([id])).get(Number(id)) || []
    };
  }

  async edit(id: number, body: any) {
    const existing = await this.membersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Member not found");
    if (!body?.firstName || !body?.lastName) {
      throw new NotFoundException("firstName and lastName are required");
    }
    const churchId = await this.resolveChurchId(body.churchId);
    await this.membersRepo.update(id, {
      lastName: body.lastName,
      firstName: body.firstName,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      cityId: body.cityId ? Number(body.cityId) : null,
      barangay: body.barangay || null,
      zip: body.zip || null,
      country: body.country || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender?.trim() || "",
      maritalStatus: body.maritalStatus || null,
      nationality: body.nationality || null,
      churchId
    });
    await this.setMemberTags(id, body.tags);
    return this.view(id);
  }

  async remove(id: number) {
    const existing = await this.membersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Member not found");
    await this.membersRepo.delete(id);
    return { id, deleted: true };
  }

  async importBulk(body: { signature?: string; churchId?: number | string | null; members?: any[] }) {
    if (!body?.signature || !VALID_MEMBER_BULK_SIGNATURES.has(body.signature)) {
      throw new BadRequestException(
        "Invalid or missing template signature. Please download and use the member import template from this system."
      );
    }

    const rows = Array.isArray(body.members) ? body.members : [];
    if (!rows.length) {
      throw new BadRequestException("No member rows were provided for import.");
    }

    let importChurchId: number | null = null;
    if (body.churchId != null && body.churchId !== "") {
      importChurchId = await this.resolveChurchId(body.churchId);
      if (!importChurchId) {
        throw new BadRequestException("The church identifier in this template is invalid.");
      }
    }

    const existingMembers = await this.membersRepo.find({
      select: ["firstName", "lastName"]
    });
    const duplicateIndex = buildMemberDuplicateIndex(existingMembers);
    const batchNames = new Map<string, number>();
    const importTagCache = new Map(
      (await this.tagsRepo.find()).map((tag) => [tag.name.toLowerCase(), tag])
    );

    const created: Awaited<ReturnType<MembersService["view"]>>[] = [];
    const errors: { row: number; message: string }[] = [];

    for (const row of rows) {
      const rowNumber = Number(row?.rowNumber) || 0;
      const firstName = row?.firstName?.trim();
      const lastName = row?.lastName?.trim();

      if (!firstName || !lastName) {
        errors.push({
          row: rowNumber,
          message: "First name and last name are required."
        });
        continue;
      }

      const duplicateMessage = findMemberDuplicate(
        { firstName, lastName },
        duplicateIndex,
        batchNames,
        rowNumber
      );
      if (duplicateMessage) {
        errors.push({ row: rowNumber, message: duplicateMessage });
        continue;
      }

      try {
        const cityId = await this.resolveCityId(row?.city);
        if (row?.city?.trim() && !cityId) {
          errors.push({
            row: rowNumber,
            message: `City "${row.city.trim()}" was not found.`
          });
          continue;
        }

        const tagNames = this.parseImportTagField(row?.tag);

        const saved = await this.membersRepo.save(
          this.membersRepo.create({
            lastName,
            firstName,
            email: row.email?.trim() || null,
            phone: row.phone?.trim() || null,
            address: row.address?.trim() || null,
            cityId,
            barangay: row.barangay?.trim() || null,
            zip: row.zip?.trim() || null,
            country: row.country?.trim() || null,
            dateOfBirth: row.dateOfBirth?.trim() || null,
            gender: row.gender?.trim() || "",
            maritalStatus: row.maritalStatus?.trim() || null,
            nationality: row.nationality?.trim() || null,
            churchId: importChurchId
          })
        );
        if (tagNames.length) {
          const tags = await this.resolveImportTags(tagNames, importTagCache);
          await this.assignMemberTags(saved.id, tags);
        }
        created.push(await this.view(saved.id));
        registerMemberDuplicateName({ firstName, lastName }, duplicateIndex, batchNames, rowNumber);
      } catch (err: any) {
        const message =
          err?.code === "ER_DUP_ENTRY"
            ? "A member with this email already exists."
            : err?.message || "Failed to import this row.";
        errors.push({ row: rowNumber, message });
      }
    }

    return {
      created: created.length,
      members: created,
      errors
    };
  }

  private async resolveChurchId(churchId?: number | string | null) {
    if (!churchId) return null;
    const church = await this.churchesRepo.findOne({ where: { id: Number(churchId) } });
    if (!church) throw new BadRequestException("Church not found");
    return church.id;
  }

  private async resolveCityId(cityName?: string) {
    const term = cityName?.trim();
    if (!term) return null;

    const exact = await this.citiesRepo.findOne({ where: { munCity: term } });
    if (exact) return exact.id;

    const matches = await this.citiesRepo.find({
      where: { munCity: Like(`%${term}%`) },
      order: { munCity: "ASC" },
      take: 2
    });

    if (matches.length === 1) return matches[0].id;
    return null;
  }

  private normalizeTagNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((tag) => String(tag || "").trim()).filter(Boolean))];
  }

  private parseImportTagField(value?: string | null): string[] {
    if (!value?.trim()) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const part of value.split(",")) {
      const tag = part.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(tag);
    }
    return names;
  }

  private async resolveImportTags(
    tagNames: string[],
    tagCache: Map<string, TagEntity>
  ): Promise<TagEntity[]> {
    const resolved: TagEntity[] = [];

    for (const name of tagNames) {
      const key = name.toLowerCase();
      let tag = tagCache.get(key);
      if (!tag) {
        try {
          tag = await this.tagsRepo.save(this.tagsRepo.create({ name }));
        } catch (err: any) {
          if (err?.code === "ER_DUP_ENTRY") {
            tag = await this.tagsRepo
              .createQueryBuilder("tag")
              .where("LOWER(tag.name) = LOWER(:name)", { name })
              .getOne();
            if (!tag) throw err;
          } else {
            throw err;
          }
        }
        tagCache.set(key, tag);
      }
      resolved.push(tag);
    }

    return resolved;
  }

  private async assignMemberTags(memberId: number, tags: TagEntity[]) {
    await this.memberTagsRepo.delete({ memberId });
    if (!tags.length) return;
    await this.memberTagsRepo.save(
      tags.map((tag) => this.memberTagsRepo.create({ memberId, tagId: tag.id }))
    );
  }

  private async setMemberTags(memberId: number, value: unknown) {
    const tagNames = this.normalizeTagNames(value);
    const tags = tagNames.length ? await this.tagsRepo.find({ where: { name: In(tagNames) } }) : [];
    const missingTags = tagNames.filter((name) => !tags.some((tag) => tag.name === name));
    if (missingTags.length) throw new BadRequestException(`Unknown tag: ${missingTags.join(", ")}`);

    await this.memberTagsRepo.delete({ memberId });
    if (!tagNames.length) return;

    await this.memberTagsRepo.save(tags.map((tag) => this.memberTagsRepo.create({ memberId, tagId: tag.id })));
  }

  private async getMemberIdsByTagName(tagName: string) {
    const rows = await this.membersRepo.query(
      `SELECT DISTINCT m.id AS id
       FROM member m
       INNER JOIN member_tag mt ON mt.member_id = m.id
       INNER JOIN tag t ON t.id = mt.tag_id AND LOWER(t.name) = LOWER(?)
       ORDER BY m.id DESC`,
      [tagName]
    );
    return rows.map((row: { id: string | number }) => Number(row.id));
  }

  private async loadMemberTags(memberIds: number[]) {
    const map = new Map<number, string[]>();
    if (!memberIds.length) return map;

    const rows = await this.memberTagsRepo
      .createQueryBuilder("mt")
      .innerJoin(TagEntity, "tag", "tag.id = mt.tag_id")
      .select("mt.member_id", "memberId")
      .addSelect("tag.name", "name")
      .where("mt.member_id IN (:...memberIds)", { memberIds })
      .orderBy("tag.name", "ASC")
      .getRawMany<{ memberId: string; name: string }>();

    rows.forEach((row) => {
      const memberId = Number(row.memberId);
      const existing = map.get(memberId) || [];
      existing.push(row.name);
      map.set(memberId, existing);
    });
    return map;
  }
}
