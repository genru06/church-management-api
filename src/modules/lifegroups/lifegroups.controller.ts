import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { LifeGroupsService } from "./lifegroups.service";

@Controller("lifegroups")
export class LifeGroupsController {
  constructor(private readonly lifeGroupsService: LifeGroupsService) {}

  @Post()
  add(@Body() body: any) {
    return this.lifeGroupsService.add(body);
  }

  @Get()
  list() {
    return this.lifeGroupsService.list();
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.lifeGroupsService.view(Number(id));
  }

  @Put(":id")
  edit(@Param("id") id: string, @Body() body: any) {
    return this.lifeGroupsService.edit(Number(id), body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.lifeGroupsService.remove(Number(id));
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @Body() body: any) {
    return this.lifeGroupsService.addMember(Number(id), body);
  }
}
