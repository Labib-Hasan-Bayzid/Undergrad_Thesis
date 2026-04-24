import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BookingStatus = 'pending' | 'paid' | 'failed' | 'canceled';

@Entity('workshop_bookings')
export class WorkshopBookingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  buyerId: string | null;

  @Column({ type: 'uuid' })
  workshopId: string;

  @Column({ type: 'varchar', length: 180 })
  workshopName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  workshopPhone: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  workshopLocation: string | null;

  @Column({ type: 'uuid' })
  serviceId: string;

  @Column({ type: 'varchar', length: 180 })
  serviceTitle: string;

  @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  amount: number;

  @Column({ type: 'varchar', length: 80 })
  customerName: string;

  @Column({ type: 'varchar', length: 30 })
  customerPhone: string;

  @Column({ type: 'varchar', length: 10 })
  vehicleType: string; // car/bike

  @Column({ type: 'varchar', length: 120 })
  vehicleInfo: string;

  @Column({ type: 'date' })
  date: string; // "YYYY-MM-DD"

  @Column({ type: 'varchar', length: 10 })
  time: string; // "10:00"

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: BookingStatus;

  @Column({ type: 'uuid', nullable: true })
  paymentOrderId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}