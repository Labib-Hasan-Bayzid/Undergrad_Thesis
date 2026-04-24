import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkshopBookingsController } from './workshop-bookings.controller';
import { WorkshopBookingsService } from './workshop-bookings.service';
import { WorkshopBookingEntity } from './workshop-booking.entity'; // adjust name/path

@Module({
  imports: [TypeOrmModule.forFeature([WorkshopBookingEntity])],
  controllers: [WorkshopBookingsController],
  providers: [WorkshopBookingsService],
  exports: [WorkshopBookingsService], // ✅ MUST export so other modules can inject it
})
export class WorkshopBookingsModule {}