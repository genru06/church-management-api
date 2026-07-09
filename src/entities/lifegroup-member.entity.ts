import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "lifegroup_member" })
export class LifeGroupMemberEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "lifegroup_id", type: "bigint", unsigned: true })
  lifeGroupId: number;

  @Column({ name: "member_id", type: "bigint", unsigned: true })
  memberId: number;

  @Column({ name: "parent_member_id", type: "bigint", unsigned: true, nullable: true })
  parentMemberId: number | null;
}
