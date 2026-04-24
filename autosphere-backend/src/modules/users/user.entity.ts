import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole =
  | 'admin'
  | 'vehicle_seller'
  | 'service_seller'
  | 'spare_parts_seller'
  | 'user';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ type: 'varchar', length: 120 })
  city: string;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role: UserRole;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  // Seller information (nullable for normal users)
  @Column({ type: 'varchar', length: 200, nullable: true, default: null })
  sellerLocation: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, default: null })
  sellerContact: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, default: null })
  sellerTin: string | null;

  // ✅ Seller documents stored INSIDE Postgres
  @Column({ type: 'bytea', nullable: true, default: null })
  tradeLicenseBytes: Buffer | null;

  @Column({ type: 'varchar', length: 160, nullable: true, default: null })
  tradeLicenseName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  tradeLicenseMime: string | null;

  @Column({ type: 'bytea', nullable: true, default: null })
  incomeTaxBytes: Buffer | null;

  @Column({ type: 'varchar', length: 160, nullable: true, default: null })
  incomeTaxName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  incomeTaxMime: string | null;

  // Refresh token hash (nullable)
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  refreshTokenHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'boolean', default: false })
isVerified: boolean;

@Column({ type: 'boolean', default: false })
isBlocked: boolean;
//
@Column({ type: 'varchar', length: 120, nullable: true, default: null })
tradeLicenseModelFileId: string | null;

@Column({ type: 'varchar', length: 40, nullable: true, default: 'pending_model' })
tradeLicenseStorageStatus: string | null;

@Column({ type: 'varchar', length: 120, nullable: true, default: null })
incomeTaxModelFileId: string | null;

@Column({ type: 'varchar', length: 40, nullable: true, default: 'pending_model' })
incomeTaxStorageStatus: string | null;

}
