import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt/jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { PasswordResetOtp } from './password-reset-otp.entity';
import { MailService } from './mail.service';

const signOptions: SignOptions = { expiresIn: 60 * 60 * 24 * 7 }; // 7 days


@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([PasswordResetOtp]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret_change_me',
      signOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService,JwtStrategy,MailService],
})
export class AuthModule {}
