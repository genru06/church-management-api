import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "lifegroup" })
export class LifeGroupEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "lifegroup_name", type: "varchar", length: 180 })
  name: string;

  @Column({ name: "coach_member_id", type: "bigint", unsigned: true, nullable: true })
  coachMemberId: number | null;

  @Column({ name: "church_id", type: "bigint", unsigned: true, nullable: true })
  churchId: number | null;
}
