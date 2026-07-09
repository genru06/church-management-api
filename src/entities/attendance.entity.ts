import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "attendance" })
export class AttendanceEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "lifegroup_id", type: "bigint", unsigned: true })
  lifeGroupId: number;

  @Column({ name: "week_start_date", type: "date" })
  weekOf: string;

  @Column({ name: "present_count", type: "int", unsigned: true, default: 0 })
  presentCount: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  notes: string | null;
}
