import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkshopBookingEntity } from './workshop-booking.entity';

@Injectable()
export class WorkshopBookingsService {
  constructor(
    @InjectRepository(WorkshopBookingEntity)
    private readonly repo: Repository<WorkshopBookingEntity>,
  ) {}

  async createPending(buyerId: string, body: any) {
    if (!body?.workshopId || !body?.serviceId) throw new BadRequestException('Missing workshopId/serviceId');

    const row = this.repo.create({
      buyerId,
      workshopId: body.workshopId,
      workshopName: body.workshopName || 'Workshop',
      workshopPhone: body.workshopPhone || null,
      workshopLocation: body.workshopLocation || null,

      serviceId: body.serviceId,
      serviceTitle: body.serviceTitle || 'Service',
      amount: Number(body.amount || 0),

      customerName: String(body.customerName || '').trim(),
      customerPhone: String(body.customerPhone || '').trim(),
      vehicleType: String(body.vehicleType || 'car'),
      vehicleInfo: String(body.vehicleInfo || '').trim(),
      date: String(body.date || '').trim(),
      time: String(body.time || '').trim(),
      note: body.note ? String(body.note) : null,

      status: 'pending',
      paymentOrderId: null,
      paidAt: null,
    });

    if (!row.customerName || !row.customerPhone || !row.vehicleInfo || !row.date || !row.time) {
      throw new BadRequestException('Missing booking details');
    }

    const saved = await this.repo.save(row);
    return { id: saved.id };
  }

  async markPaid(bookingId: string, orderId: string) {
    await this.repo.update(
      { id: bookingId },
      { status: 'paid', paymentOrderId: orderId, paidAt: new Date() },
    );
  }

  async markFailed(bookingId: string) {
    await this.repo.update({ id: bookingId }, { status: 'failed' });
  }
}