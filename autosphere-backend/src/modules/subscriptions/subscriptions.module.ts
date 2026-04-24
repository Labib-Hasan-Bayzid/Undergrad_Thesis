import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEntity } from './subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity])],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService], // ✅ THIS is required
})
export class SubscriptionsModule {}