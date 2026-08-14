import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ChurchesService } from "./churches.service";

@Controller("churches")
export class ChurchesController {
  constructor(private readonly churchesService: ChurchesService) {}

  @Post()
  add(@Body() body: any) {
    return this.churchesService.add(body);
  }

  @Get()
  list(@Query("tag") tag?: string | string[], @Query("excludeTag") excludeTag?: string | string[]) {
    return this.churchesService.list(tag, excludeTag);
  }

  @Get(":id/members")
  listMembers(@Param("id") id: string) {
    return this.churchesService.listMembers(Number(id));
  }

  @Get(":id/lifegroups")
  listLifeGroups(@Param("id") id: string) {
    return this.churchesService.listLifeGroups(Number(id));
  }

  @Get(":id/events")
  listEvents(@Param("id") id: string) {
    return this.churchesService.listEvents(Number(id));
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.churchesService.view(Number(id));
  }

  @Put(":id")
  edit(@Param("id") id: string, @Body() body: any) {
    return this.churchesService.edit(Number(id), body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.churchesService.remove(Number(id));
  }
}
