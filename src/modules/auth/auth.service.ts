import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import jwt from "jsonwebtoken";
import { Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";

@Injectable()
export class AuthService {
  constructor(@InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>) {}

  async login(body: any) {
    const email = body?.email;
    const password = body?.password;
    const secret = process.env.JWT_SECRET || "change-this-secret";
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user || user.passwordHash !== password) throw new UnauthorizedException("Invalid credentials");

    const token = jwt.sign({ userId: user.id, role: "admin" }, secret, { expiresIn: "8h" });
    return { token, user: { id: user.id, name: user.fullName, email: user.email } };
  }
}
