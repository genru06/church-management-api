import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../../shared/current-user.decorator";
import { AuthUser } from "../../shared/permissions";
import { AclService } from "./acl.service";

@Controller("acl")
export class AclController {
  constructor(private readonly aclService: AclService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.aclService.overview(user);
  }

  @Get("resources")
  listResources() {
    return this.aclService.listResources();
  }

  @Get("tags")
  listTags(@CurrentUser() user: AuthUser) {
    return this.aclService.listTagsWithPermissions(user);
  }

  @Post("tags")
  createTag(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.aclService.createTag(user, body);
  }

  @Delete("tags/:id")
  removeTag(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.aclService.removeTag(user, Number(id));
  }

  @Put("tags/:id/permissions")
  setPermissions(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    return this.aclService.setTagPermissions(user, Number(id), body);
  }
}
