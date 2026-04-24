import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('password_reset_otps')
export class PasswordResetOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  email: string;

  @Column()
  otpHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
