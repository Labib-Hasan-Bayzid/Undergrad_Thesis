import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';

@Entity('vehicle_images')
export class VehicleImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => VehicleEntity, (v) => v.images, { onDelete: 'CASCADE' })
  vehicle: VehicleEntity;

  @Column({ type: 'varchar', length: 100 })
  mime: string;

  @Column({ type: 'varchar', length: 180 })
  originalName: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'bool', default: false })
  isCover: boolean;

  @Column({ type: 'bytea' })
  bytes: Buffer;

  @CreateDateColumn()
  createdAt: Date;
}
