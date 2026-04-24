import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UserEntity } from '../users/user.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { ServiceListingEntity } from '../services/services.entity';
import { PaymentOrderEntity } from '../payments/payment-order.entity';
import { SubscriptionEntity } from '../subscriptions/subscription.entity';
import { PqcBridgeService } from '../auth/pqc-bridge.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, VehicleEntity, ServiceListingEntity,PaymentOrderEntity, SubscriptionEntity])],
  controllers: [AdminController],
  providers: [AdminService, PqcBridgeService],
})
export class AdminModule {}
