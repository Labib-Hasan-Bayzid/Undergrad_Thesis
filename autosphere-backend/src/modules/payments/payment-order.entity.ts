import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'canceled';

@Entity('payment_orders')
export class PaymentOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  source: string; // 'workshops' | 'marketplace' etc

  @Column({ type: 'uuid', nullable: true })
  buyerId: string | null; // public users may be null for now

  @Column({
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'bdt' })
  currency: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  stripeSessionId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  stripePaymentIntentId: string | null;

    @Column({ type: 'varchar', length: 20, default: 'stripe' })
  provider: 'stripe' | 'sslcz';

  @Column({ type: 'varchar', length: 120, nullable: true })
  sslczTranId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sslczValId: string | null;


  @Column({ type: 'jsonb' })
  items: any; // [{kind,id,qty,title,unitPrice,sellerId}]

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
