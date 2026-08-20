import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event_attendance" })
export class EventAttendanceEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "event_id", type: "bigint", unsigned: true })
  eventId: number;

  @Column({ name: "participant_id", type: "bigint", unsigned: true })
  participantId: number;

  @Column({ name: "session_id", type: "bigint", unsigned: true })
  sessionId: number;

  @Column({ name: "attended_at", type: "timestamp" })
  attendedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
