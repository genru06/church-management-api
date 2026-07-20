import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "tag_acl" })
export class TagAclEntity {
  @PrimaryColumn({ name: "tag_id", type: "bigint", unsigned: true })
  tagId: number;

  @PrimaryColumn({ name: "resource_id", type: "bigint", unsigned: true })
  resourceId: number;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;
}
