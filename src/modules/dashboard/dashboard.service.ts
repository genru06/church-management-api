import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MemberEntity } from "../../entities/member.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>
  ) {}

  async getDashboard() {
    const [memberCount, churchCount, lifeGroupCount] = await Promise.all([
      this.membersRepo.count(),
      this.churchesRepo.count(),
      this.lifeGroupsRepo.count()
    ]);
    return {
      totalMembers: memberCount,
      totalChurches: churchCount,
      totalLifeGroups: lifeGroupCount
    };
  }
}
