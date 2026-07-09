import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "user" })
export class UserEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "full_name", type: "varchar", length: 150 })
  fullName: string;

  @Column({ type: "varchar", length: 100, unique: true })
  username: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash: string;

  @Column({ name: "member_id", type: "bigint", unsigned: true, nullable: true })
  memberId: number | null;

  @Column({ name: "church_id", type: "bigint", unsigned: true, nullable: true })
  churchId: number | null;

  @Column({ name: "is_active", type: "tinyint", width: 1, default: 1 })
  isActive: boolean;
}
