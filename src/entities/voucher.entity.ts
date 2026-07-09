import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "voucher" })
export class VoucherEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "voucher_no", type: "varchar", length: 50, unique: true })
  voucherNo: string;

  @Column({ name: "voucher_date", type: "date" })
  voucherDate: string;

  @Column({ type: "varchar", length: 200 })
  payee: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: string;

  @Column({ type: "text" })
  purpose: string;

  @Column({
    type: "enum",
    enum: ["draft", "approved", "paid", "cancelled"],
    default: "draft"
  })
  status: "draft" | "approved" | "paid" | "cancelled";

  @Column({ type: "text", nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
