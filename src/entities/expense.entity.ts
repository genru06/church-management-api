import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "expense" })
export class ExpenseEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "expense_date", type: "date" })
  expenseDate: string;

  @Column({ type: "varchar", length: 100 })
  category: string;

  @Column({ type: "varchar", length: 200 })
  payee: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "approved_by", type: "varchar", length: 200, nullable: true })
  approvedBy: string | null;

  @Column({ type: "text", nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
