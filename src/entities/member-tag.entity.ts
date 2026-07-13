import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "member_tag" })
export class MemberTagEntity {
  @PrimaryColumn({ name: "member_id", type: "bigint", unsigned: true })
  memberId: number;

  @PrimaryColumn({ name: "tag_id", type: "bigint", unsigned: true })
  tagId: number;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;
}
