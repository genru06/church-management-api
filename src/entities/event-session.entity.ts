import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event_session" })
export class EventSessionEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "event_id", type: "bigint", unsigned: true })
  eventId: number;

  @Column({ name: "session_date", type: "date" })
  sessionDate: string;

  @Column({ name: "sort_order", type: "int", unsigned: true, default: 1 })
  sortOrder: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
