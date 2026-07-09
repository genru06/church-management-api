import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { AuthUser } from "./permissions";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers?.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Authentication required");

    const secret = process.env.JWT_SECRET || "change-this-secret";
    try {
      const payload = jwt.verify(token, secret) as AuthUser & { userId?: number };
      request.user = {
        id: payload.id ?? payload.userId,
        fullName: payload.fullName,
        username: payload.username,
        tags: payload.tags || [],
        churchId: payload.churchId ?? null,
        memberId: payload.memberId ?? null
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
