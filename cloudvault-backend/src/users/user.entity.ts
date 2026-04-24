import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

@Column()
fullName: string;

@Column({ unique: true, nullable: true })
phone: string;


@Column({ unique: true })
email: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
