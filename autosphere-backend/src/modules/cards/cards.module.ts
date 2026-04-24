import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEntity } from './card.entity';
import { UserEntity } from '../users/user.entity';
import { PqcBridgeService } from './pqc-bridge.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardEntity, UserEntity])],
  controllers: [CardsController],
  providers: [CardsService,PqcBridgeService],
})
export class CardsModule {}