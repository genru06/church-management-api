import { Controller, Get, Param, Query } from "@nestjs/common";
import { CitiesService } from "./cities.service";

@Controller("cities")
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  list(@Query("search") search?: string, @Query("limit") limit?: string) {
    return this.citiesService.list(search || "", Number(limit || 20));
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.citiesService.view(Number(id));
  }
}
