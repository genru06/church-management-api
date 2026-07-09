import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../../shared/current-user.decorator";
import { AuthUser } from "../../shared/permissions";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("tags")
  listTags() {
    return this.usersService.listTags();
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.usersService.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.usersService.create(user, body);
  }

  @Put(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    return this.usersService.update(user, Number(id), body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.usersService.remove(user, Number(id));
  }
}
