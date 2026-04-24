import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ServiceListingEntity } from './services.entity';

@Entity('service_images')
export class ServiceImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  listingId: string;

  @ManyToOne(() => ServiceListingEntity, (l) => l.images, { onDelete: 'CASCADE' })
  listing: ServiceListingEntity;

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
