import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Like, Repository } from "typeorm";
import { CityEntity } from "../../entities/city.entity";

@Injectable()
export class CitiesService {
  constructor(@InjectRepository(CityEntity) private readonly citiesRepo: Repository<CityEntity>) {}

  async list(search = "", limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.citiesRepo.find({
      where: {
        munCity: Like(`%${search.trim()}%`)
      },
      order: {
        munCity: "ASC"
      },
      take: safeLimit
    });
  }

  async view(id: number) {
    const row = await this.citiesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("City not found");
    return row;
  }
}
