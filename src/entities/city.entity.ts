import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "cities" })
export class CityEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "mun_city", type: "varchar", length: 255 })
  munCity: string;

  @Column({ name: "zip_code", type: "int", nullable: true })
  zipCode: number | null;

  @Column({ type: "int", nullable: true })
  province: number | null;
}
