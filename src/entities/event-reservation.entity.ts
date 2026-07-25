import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event_reservation" })
export class EventReservationEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "event_id", type: "bigint", unsigned: true })
  eventId: number;

  @Column({ name: "church_id", type: "bigint", unsigned: true, nullable: true })
  churchId: number | null;

  @Column({ type: "varchar", length: 200 })
  label: string;

  @Column({ name: "participant_type", type: "varchar", length: 100 })
  participantType: string;

  @Column({ name: "reserved_count", type: "int", unsigned: true })
  reservedCount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
