import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "user_access_tag" })
export class UserAccessTagEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ type: "varchar", length: 100, unique: true })
  name: string;
}
