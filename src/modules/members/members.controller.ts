import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { MembersService } from "./members.service";

@Controller("members")
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  add(@Body() body: any) {
    return this.membersService.add(body);
  }

  @Post("import")
  importBulk(@Body() body: any) {
    return this.membersService.importBulk(body);
  }

  @Get()
  list(@Query("search") search?: string) {
    return this.membersService.list(search);
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.membersService.view(Number(id));
  }

  @Put(":id")
  edit(@Param("id") id: string, @Body() body: any) {
    return this.membersService.edit(Number(id), body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.membersService.remove(Number(id));
  }
}
