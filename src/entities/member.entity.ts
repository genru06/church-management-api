import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "member" })
export class MemberEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "last_name", type: "varchar", length: 120 })
  lastName: string;

  @Column({ name: "first_name", type: "varchar", length: 120 })
  firstName: string;

  @Column({ type: "varchar", length: 190, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  address: string | null;

  @Column({ name: "city_id", type: "int", nullable: true })
  cityId: number | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  barangay: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  zip: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  country: string | null;

  @Column({ name: "date_of_birth", type: "date", nullable: true })
  dateOfBirth: string | null;

  @Column({ type: "varchar", length: 20, default: "" })
  gender: string;

  @Column({ name: "marital_status", type: "varchar", length: 40, nullable: true })
  maritalStatus: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  nationality: string | null;

  @Column({ name: "church_id", type: "bigint", unsigned: true, nullable: true })
  churchId: number | null;
}
