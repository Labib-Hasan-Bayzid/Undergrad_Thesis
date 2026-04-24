import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('password_resets')
export class PasswordResetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  role: string;

  @Column({ type: 'varchar', length: 255 })
  otpHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  consumedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  resetTokenHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
