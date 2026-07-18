import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event" })
export class EventEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ type: "varchar", length: 200 })
  name: string;

  @Column({ name: "event_date", type: "date", nullable: true })
  eventDate: string | null;

  @Column({ name: "event_time", type: "varchar", length: 20 })
  eventTime: string;

  @Column({ type: "varchar", length: 255 })
  location: string;

  @Column({ type: "text" })
  description: string;

  @Column({ name: "expected_participants", type: "int", unsigned: true, nullable: true })
  expectedParticipants: number | null;

  @Column({ name: "registration_fee", type: "decimal", precision: 10, scale: 2, nullable: true, default: 0 })
  registrationFee: string | null;

  @Column({ type: "enum", enum: ["draft", "published", "ongoing", "completed", "cancelled"], default: "draft" })
  status: string;

  @Column({ name: "event_type", type: "enum", enum: ["internal", "external"], default: "internal" })
  eventType: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  tags: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  organizer: string | null;

  @Column({ name: "contact_person", type: "varchar", length: 200, nullable: true })
  contactPerson: string | null;

  @Column({ name: "contact_email", type: "varchar", length: 190, nullable: true })
  contactEmail: string | null;

  @Column({ name: "allow_pledges", type: "boolean", default: false })
  allowPledges: boolean;

  @Column({ name: "requires_pre_registration", type: "boolean", default: false })
  requiresPreRegistration: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "created_by", type: "bigint", unsigned: true, nullable: true })
  createdBy: number | null;

  @Column({ name: "updated_by", type: "bigint", unsigned: true, nullable: true })
  updatedBy: number | null;
}
