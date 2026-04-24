import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegisterDto } from './dto/register.dto';
import { PasswordResetOtp } from './password-reset-otp.entity';
import { MailService } from './mail.service';


@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,

    @InjectRepository(PasswordResetOtp)
    private otpRepo: Repository<PasswordResetOtp>,

    private mail: MailService,
  ) {}

  // ✅ register now accepts DTO (fullName/phone/email/password/confirmPassword)
  async register(dto: RegisterDto) {
    
    const { fullName, phone, email, password, confirmPassword } = dto;

    // 1) password match
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // 2) unique email
    const existingEmail = await this.users.findByEmail(email);
    if (existingEmail) throw new BadRequestException('Email already registered');

    // 3) unique phone (ONLY if your UsersService has it)
    // If you don't have findByPhone yet, comment this out for now.
    //const existingPhone = await this.users.findByPhone?.(phone);
   // if (existingPhone) throw new BadRequestException('Phone already registered');

    // 4) hash + create user
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.users.create({
  fullName: dto.fullName,   // ✅ map frontend fullName to DB name
  phone: dto.phone,     // keep only if your User has phone
  email: dto.email,
  passwordHash,
});


    return this.signToken(user.id, user.email);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user.id, user.email);
  }

 private generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async forgotPassword(email: string) {
  const user = await this.users.findByEmail(email);

  // Do NOT reveal whether user exists
  const safeResponse = { message: 'If the email exists, an OTP has been sent.' };
  if (!user) return safeResponse;

  const otp = this.generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await this.otpRepo.save(
    this.otpRepo.create({
      email,
      otpHash,
      expiresAt,
      used: false,
    }),
  );

  await this.mail.sendOtp(email, otp);

  return safeResponse;
}


  async resetPassword(email: string, otp: string, newPassword: string) {
  const record = await this.otpRepo.findOne({
    where: { email, used: false },
    order: { createdAt: 'DESC' },
  });

  if (!record) throw new BadRequestException('Invalid OTP');
  if (record.expiresAt.getTime() < Date.now())
    throw new BadRequestException('OTP expired');

  const ok = await bcrypt.compare(otp, record.otpHash);
  if (!ok) throw new BadRequestException('Invalid OTP');

  const user = await this.users.findByEmail(email);
  if (!user) throw new BadRequestException('Invalid request');

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await this.users.create(user); // save()

  record.used = true;
  await this.otpRepo.save(record);

  return { message: 'Password reset successful' };
}


 private signToken(userId: string, email: string) {
  const access_token = this.jwt.sign({ sub: userId, email }); // ✅ keep sub
  return { access_token };
}

}
