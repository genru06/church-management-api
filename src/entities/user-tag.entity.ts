import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "user_tag" })
export class UserTagEntity {
  @PrimaryColumn({ name: "user_id", type: "bigint", unsigned: true })
  userId: number;

  @PrimaryColumn({ name: "tag_id", type: "bigint", unsigned: true })
  tagId: number;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;
}
