import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ServiceImageEntity } from './services-image.entity';

export type ServiceCategory = 'service' | 'part';
export type ServiceStatus = 'available' | 'sold' | 'hidden';

@Entity('service_listings')
export class ServiceListingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sellerId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 12 })
  category: ServiceCategory; // 'service' | 'part'

  // shared
  @Column({ type: 'varchar', length: 16 })
  vehicleSupport: 'car' | 'bike' | 'both';

  @Column({
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number(v),
    },
  })
  price: number;

  @Column({ type: 'varchar', length: 80 })
  city: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 220 })
  location: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // service-specific
  @Column({ type: 'varchar', length: 30, nullable: true })
  serviceType: 'maintenance' | 'repair' | 'diagnostics' | 'detailing' | null;

  // part-specific
  @Column({ type: 'varchar', length: 30, nullable: true })
  partCategory: 'engine' | 'brakes' | 'suspension' | 'electrical' | 'body' | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  partCondition: 'new' | 'used' | 'refurbished' | null;

  @Column({ type: 'int', nullable: true })
  stock: number | null;

  @Column({ type: 'varchar', length: 12, default: 'available' })
  status: ServiceStatus;

  @OneToMany(() => ServiceImageEntity, (img) => img.listing)
  images: ServiceImageEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
