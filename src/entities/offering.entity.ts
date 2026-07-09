import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "offering" })
export class OfferingEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "record_date", type: "date" })
  recordDate: string;

  @Column({ name: "bill_1000", type: "int", unsigned: true, default: 0 })
  bill1000: number;

  @Column({ name: "bill_500", type: "int", unsigned: true, default: 0 })
  bill500: number;

  @Column({ name: "bill_200", type: "int", unsigned: true, default: 0 })
  bill200: number;

  @Column({ name: "bill_100", type: "int", unsigned: true, default: 0 })
  bill100: number;

  @Column({ name: "bill_50", type: "int", unsigned: true, default: 0 })
  bill50: number;

  @Column({ name: "bill_20", type: "int", unsigned: true, default: 0 })
  bill20: number;

  @Column({ name: "bill_10", type: "int", unsigned: true, default: 0 })
  bill10: number;

  @Column({ name: "bill_5", type: "int", unsigned: true, default: 0 })
  bill5: number;

  @Column({ name: "bill_1", type: "int", unsigned: true, default: 0 })
  bill1: number;

  @Column({ name: "total_amount", type: "decimal", precision: 10, scale: 2 })
  totalAmount: string;

  @Column({ name: "counted_by", type: "varchar", length: 200 })
  countedBy: string;

  @Column({ name: "checked_by", type: "varchar", length: 200 })
  checkedBy: string;

  @Column({ type: "text", nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
