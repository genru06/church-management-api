import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event_participant" })
export class EventParticipantEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "event_id", type: "bigint", unsigned: true })
  eventId: number;

  @Column({ name: "member_id", type: "bigint", unsigned: true, nullable: true })
  memberId: number | null;

  @Column({ name: "full_name", type: "varchar", length: 200 })
  fullName: string;

  @Column({ type: "varchar", length: 190, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  phone: string | null;

  @Column({ name: "qr_token", type: "varchar", length: 64, unique: true })
  qrToken: string;

  @Column({ name: "attended_at", type: "timestamp", nullable: true })
  attendedAt: Date | null;

  @Column({ name: "registration_paid", type: "boolean", default: false })
  registrationPaid: boolean;

  @Column({ name: "registration_amount", type: "decimal", precision: 10, scale: 2, nullable: true })
  registrationAmount: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
