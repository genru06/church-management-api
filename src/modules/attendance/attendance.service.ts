import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AttendanceEntity } from "../../entities/attendance.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceEntity) private readonly attendanceRepo: Repository<AttendanceEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>
  ) {}

  async list() {
    return this.attendanceRepo
      .createQueryBuilder("a")
      .leftJoin(LifeGroupEntity, "lg", "lg.id = a.lifeGroupId")
      .select("a.id", "id")
      .addSelect("a.lifeGroupId", "lifeGroupId")
      .addSelect("a.weekOf", "weekOf")
      .addSelect("a.presentCount", "presentCount")
      .addSelect("lg.name", "lifeGroupName")
      .orderBy("a.weekOf", "DESC")
      .addOrderBy("a.id", "DESC")
      .getRawMany();
  }

  async add(body: any) {
    const saved = await this.attendanceRepo.save(
      this.attendanceRepo.create({
        lifeGroupId: Number(body.lifeGroupId),
        weekOf: body.weekOf,
        presentCount: Number(body.presentCount || 0),
        notes: body.notes || null
      })
    );

    const lifeGroup = await this.lifeGroupsRepo.findOne({ where: { id: saved.lifeGroupId } });
    return {
      id: saved.id,
      lifeGroupId: saved.lifeGroupId,
      weekOf: saved.weekOf,
      presentCount: saved.presentCount,
      lifeGroupName: lifeGroup?.name || "-"
    };
  }
}
