import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';

export type VehicleType = 'car' | 'bike';
export type VehicleCondition = 'new' | 'used' | 'recondition';
export type VehicleStatus = 'available' | 'sold' | 'hidden';
import { OneToMany } from 'typeorm';
import { VehicleImageEntity } from './vehicle-image.entity';

@Entity('vehicles')
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sellerId: string;

  @ManyToOne(() => UserEntity)
  seller: UserEntity;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'varchar', length: 10 })
  vehicleType: VehicleType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  @Column({ type: 'varchar', length: 20 })
  condition: VehicleCondition;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'varchar', length: 80 })
  city: string;

  @Column({ type: 'varchar', length: 40 })
  phone: string;

  @Column({ type: 'varchar', length: 160 })
  location: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'available' })
  status: VehicleStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => VehicleImageEntity, (img) => img.vehicle)
images: VehicleImageEntity[];

}
