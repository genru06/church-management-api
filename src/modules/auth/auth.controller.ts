import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../shared/current-user.decorator";
import { Public } from "../../shared/public.decorator";
import { AuthUser } from "../../shared/permissions";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }
}
