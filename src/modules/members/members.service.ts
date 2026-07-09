import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Like, Repository } from "typeorm";
import { MemberEntity } from "../../entities/member.entity";
import { CityEntity } from "../../entities/city.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { getChurchDisplayName } from "../../utils/church-display";
import { loadPastorChurchesByMemberId, resolveMemberChurchId } from "../../utils/member-church";

export const MEMBER_BULK_TEMPLATE_SIGNATURE = "LIFEGROUP_MEMBER_BULK_V1";

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
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
    return this.view(saved.id);
  }

  async list(search?: string) {
    const qb = this.membersRepo.createQueryBuilder("member").orderBy("member.id", "DESC");
    const term = search?.trim();
    if (term) {
      qb.andWhere("(member.firstName LIKE :term OR member.lastName LIKE :term)", { term: `%${term}%` });
    }
    const rows = await qb.getMany();
    const memberIds = rows.map((row) => row.id);
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
        church: churchId ? churchMap.get(churchId) || null : null
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
      church: church ? getChurchDisplayName(church) : null
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
    return this.view(id);
  }

  async remove(id: number) {
    const existing = await this.membersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Member not found");
    await this.membersRepo.delete(id);
    return { id, deleted: true };
  }

  async importBulk(body: { signature?: string; members?: any[] }) {
    if (body?.signature !== MEMBER_BULK_TEMPLATE_SIGNATURE) {
      throw new BadRequestException(
        "Invalid or missing template signature. Please download and use the member import template from this system."
      );
    }

    const rows = Array.isArray(body.members) ? body.members : [];
    if (!rows.length) {
      throw new BadRequestException("No member rows were provided for import.");
    }

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

      try {
        const cityId = await this.resolveCityId(row?.city);
        if (row?.city?.trim() && !cityId) {
          errors.push({
            row: rowNumber,
            message: `City "${row.city.trim()}" was not found.`
          });
          continue;
        }

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
            nationality: row.nationality?.trim() || null
          })
        );
        created.push(await this.view(saved.id));
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
}
