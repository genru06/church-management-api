import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { UserAccessTagEntity } from "../../entities/user-access-tag.entity";
import { UserTagEntity } from "../../entities/user-tag.entity";
import { AuthUser } from "../../shared/permissions";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(UserTagEntity) private readonly userTagsRepo: Repository<UserTagEntity>
  ) {}

  private async loadUserTags(userId: number): Promise<string[]> {
    const rows = await this.userTagsRepo
      .createQueryBuilder("ut")
      .innerJoin(UserAccessTagEntity, "t", "t.id = ut.tag_id")
      .select("t.name", "name")
      .where("ut.user_id = :userId", { userId })
      .getRawMany<{ name: string }>();
    return rows.map((r) => r.name);
  }

  private buildAuthUser(user: UserEntity, tags: string[]): AuthUser {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      tags,
      churchId: user.churchId,
      memberId: user.memberId
    };
  }

  private signToken(user: AuthUser): string {
    const secret = process.env.JWT_SECRET || "change-this-secret";
    return jwt.sign(user, secret, { expiresIn: "8h" });
  }

  async login(body: any) {
    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const user = await this.usersRepo.findOne({ where: { username } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const tags = await this.loadUserTags(user.id);
    if (!tags.length) throw new UnauthorizedException("Your account has no access tags assigned. Contact an administrator.");

    const authUser = this.buildAuthUser(user, tags);
    const token = this.signToken(authUser);
    return { token, user: authUser };
  }

  async me(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException("User not found");
    const tags = await this.loadUserTags(user.id);
    return this.buildAuthUser(user, tags);
  }
}
