import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "event_pledge" })
export class EventPledgeEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "event_id", type: "bigint", unsigned: true })
  eventId: number;

  @Column({ name: "participant_id", type: "bigint", unsigned: true, nullable: true })
  participantId: number | null;

  @Column({ name: "pledger_name", type: "varchar", length: 200 })
  pledgerName: string;

  @Column({ type: "varchar", length: 190, nullable: true })
  email: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: string;

  @Column({ type: "boolean", default: false })
  paid: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
