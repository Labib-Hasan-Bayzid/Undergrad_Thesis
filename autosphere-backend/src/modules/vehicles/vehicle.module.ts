import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleEntity } from './vehicle.entity';
import { VehicleService } from './vehicle.service';
import { VehicleController } from './vehicle.controller';
import { VehicleImageEntity } from './vehicle-image.entity';
import { UserEntity } from '../users/user.entity';


@Module({
  imports: [TypeOrmModule.forFeature([VehicleEntity,VehicleImageEntity,UserEntity])],
  providers: [VehicleService],
  controllers: [VehicleController],
})
export class VehicleModule {}
