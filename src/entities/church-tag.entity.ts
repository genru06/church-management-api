import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "church_tag" })
export class ChurchTagEntity {
  @PrimaryColumn({ name: "church_id", type: "bigint", unsigned: true })
  churchId: number;

  @PrimaryColumn({ name: "tag_id", type: "bigint", unsigned: true })
  tagId: number;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;
}
