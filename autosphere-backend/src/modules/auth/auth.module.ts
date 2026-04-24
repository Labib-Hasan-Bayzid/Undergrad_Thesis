import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserEntity } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordResetEntity } from './password-reset.entity';
import {PqcBridgeService} from './pqc-bridge.service';


@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, PasswordResetEntity]), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PqcBridgeService],
})
export class AuthModule {}
