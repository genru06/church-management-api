import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../../shared/current-user.decorator";
import { AuthUser } from "../../shared/permissions";
import { TagsService } from "./tags.service";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list() {
    return this.tagsService.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.tagsService.create(user, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tagsService.remove(user, Number(id));
  }
}
