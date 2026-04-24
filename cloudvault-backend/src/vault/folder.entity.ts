import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('folders')
export class Folder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  ownerUserId: string;

  @Column()
  folderName: string;

  // Bank fields (edit as needed)
  @Column({ nullable: true }) bankName?: string;
  @Column({ nullable: true }) accountNo?: string;
  @Column({ nullable: true }) branch?: string;
  @Column({ nullable: true }) routingNo?: string;

  @CreateDateColumn()
  createdAt: Date;
}
