import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrderEntity } from './payment-order.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ServiceListingEntity } from '../services/services.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'; // ✅ add
import { WorkshopBookingsModule } from '../workshop-bookings/workshop-bookings.module'; // ✅ add
import { JwtModule } from '@nestjs/jwt'; 
@Module({
  imports: [TypeOrmModule.forFeature([PaymentOrderEntity, ServiceListingEntity,VehicleEntity]),SubscriptionsModule, WorkshopBookingsModule,JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_secret', // ✅ important
      signOptions: { expiresIn: '30m' },
    }),],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
