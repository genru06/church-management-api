import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "church" })
export class ChurchEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "church_name", type: "varchar", length: 180 })
  name: string;

  @Column({ name: "short_name", type: "varchar", length: 60, nullable: true })
  shortName: string | null;

  @Column({ name: "church_address", type: "varchar", length: 255 })
  address: string;

  @Column({ name: "pastor_member_id", type: "bigint", unsigned: true, nullable: true })
  pastorMemberId: number | null;
}
