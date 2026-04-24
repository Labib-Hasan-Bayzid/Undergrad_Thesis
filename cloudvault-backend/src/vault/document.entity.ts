import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DocType = 'NID' | 'NOC' | 'TIN' | 'OTHER';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  ownerUserId: string;

  @Index()
  @Column()
  folderId: string;

  @Column()
  docType: DocType;

  @Column()
  originalName: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'bigint' })
  sizeBytes: string;

  // encrypted bytes stored here (bytea in Postgres)
  @Column({ type: 'bytea' })
  ciphertext: Buffer;

  // crypto metadata (nonce, wrapped key, aad, version, etc.)
  @Column({ type: 'jsonb', nullable: true })
  cryptoMeta?: any;

  @CreateDateColumn()
  createdAt: Date;
}
