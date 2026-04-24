import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesController } from './services.controller';
import { ServiceImageEntity } from './services-image.entity';
import { ServiceListingEntity } from './services.entity';
import { ServicesService } from './services.service';
import { UserEntity } from '../users/user.entity'; 

@Module({
  imports: [TypeOrmModule.forFeature([ServiceListingEntity, ServiceImageEntity, UserEntity])],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
