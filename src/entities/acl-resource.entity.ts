import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "acl_resource" })
export class AclResourceEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "key", type: "varchar", length: 120, unique: true })
  key: string;

  @Column({ type: "varchar", length: 150 })
  label: string;

  @Column({ type: "enum", enum: ["page", "action", "tab"] })
  kind: "page" | "action" | "tab";

  @Column({ type: "varchar", length: 60 })
  module: string;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;
}
