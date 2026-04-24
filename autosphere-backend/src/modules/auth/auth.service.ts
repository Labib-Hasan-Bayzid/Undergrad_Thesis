import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { UserEntity } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetEntity } from './password-reset.entity';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PqcBridgeService } from './pqc-bridge.service';


type SellerDocs = {
  trade: Express.Multer.File | null;
  tax: Express.Multer.File | null;
};

@Injectable()
export class AuthService {
  constructor(
  @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  @InjectRepository(PasswordResetEntity) private readonly resets: Repository<PasswordResetEntity>,
  private readonly jwt: JwtService,
  private readonly cfg: ConfigService,
  private readonly pqcBridge: PqcBridgeService,
) {}




//
private getPendingDir() {
  const dir = path.join(process.cwd(), 'storage', 'seller_doc_pending');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

private writeTempFile(originalName: string, buffer: Buffer) {
  const safeName = `${crypto.randomUUID()}-${originalName.replace(/[^\w.\-]+/g, '_')}`;
  const fullPath = path.join(this.getPendingDir(), safeName);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}
//

  private async signTokens(user: UserEntity) {
    const accessTtl = this.cfg.get('ACCESS_TOKEN_TTL') || '15m';
    const refreshTtl = this.cfg.get('REFRESH_TOKEN_TTL') || '7d';

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.cfg.get('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.cfg.get('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto, docs?: SellerDocs) {
    const email = dto.email.trim().toLowerCase();

    const exists = await this.users.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Email already registered');

    const isSeller =
      dto.role === 'vehicle_seller' ||
      dto.role === 'service_seller' ||
      dto.role === 'spare_parts_seller';

    let tradeModelFileId: string | null = null;
let taxModelFileId: string | null = null;

if (isSeller) {
  if (docs?.trade) {
    const tradeTempPath = this.writeTempFile(docs.trade.originalname, docs.trade.buffer);
    tradeModelFileId = await this.pqcBridge.uploadFileFromWindowsPath(tradeTempPath);

    try {
      if (fs.existsSync(tradeTempPath)) fs.unlinkSync(tradeTempPath);
    } catch {}
  }

  if (docs?.tax) {
    const taxTempPath = this.writeTempFile(docs.tax.originalname, docs.tax.buffer);
    taxModelFileId = await this.pqcBridge.uploadFileFromWindowsPath(taxTempPath);

    try {
      if (fs.existsSync(taxTempPath)) fs.unlinkSync(taxTempPath);
    } catch {}
  }
}

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // ✅ Use new UserEntity() to avoid Repository.create overload issues
    const user = new UserEntity();
    user.name = dto.name;
    user.email = email;
    user.phone = dto.phone;
    user.city = dto.city;
    user.role = dto.role;
    user.passwordHash = passwordHash;

    user.sellerLocation = dto.sellerLocation ?? null;
    user.sellerContact = dto.sellerContact ?? null;
    user.sellerTin = dto.sellerTin ?? null;

    //
user.tradeLicenseBytes = null;
user.tradeLicenseName = docs?.trade ? docs.trade.originalname : null;
user.tradeLicenseMime = docs?.trade ? docs.trade.mimetype : null;
user.tradeLicenseModelFileId = tradeModelFileId;
user.tradeLicenseStorageStatus = docs?.trade ? 'stored_in_model' : null;

user.incomeTaxBytes = null;
user.incomeTaxName = docs?.tax ? docs.tax.originalname : null;
user.incomeTaxMime = docs?.tax ? docs.tax.mimetype : null;
user.incomeTaxModelFileId = taxModelFileId;
user.incomeTaxStorageStatus = docs?.tax ? 'stored_in_model' : null;
    //
   


    user.refreshTokenHash = null;

    const saved = await this.users.save(user);

    const tokens = await this.signTokens(saved);

    saved.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    await this.users.save(saved);

    return {
      user: { id: saved.id, name: saved.name, email: saved.email, role: saved.role },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.role !== dto.role) throw new UnauthorizedException('Role mismatch');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.signTokens(user);

    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    await this.users.save(user);

    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.cfg.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || !user.refreshTokenHash) throw new UnauthorizedException('No session');

      const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!match) throw new UnauthorizedException('Session invalid');

      const tokens = await this.signTokens(user);

      user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
      await this.users.save(user);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.users.update({ id: userId }, { refreshTokenHash: null });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      city: user.city,
      sellerLocation: user.sellerLocation,
      sellerContact: user.sellerContact,
      sellerTin: user.sellerTin,
      hasTradeLicense: !!user.tradeLicenseBytes,
      hasIncomeTax: !!user.incomeTaxBytes,
      isVerified: user.isVerified,
isBlocked: user.isBlocked,
    };
  }
  private genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

private async sendOtpEmail(to: string, otp: string) {
  const user = this.cfg.get('GMAIL_USER');
  const pass = this.cfg.get('GMAIL_APP_PASSWORD');

  // Dev fallback
  if (!user || !pass) {
    console.log(`[DEV OTP] ${to} OTP: ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"AutoSphere" <${user}>`,
    to,
    subject: 'AutoSphere Password Reset OTP',
    html: `
      <h2>Password Reset</h2>
      <p>Your OTP is:</p>
      <h1>${otp}</h1>
      <p>This OTP is valid for <b>10 minutes</b>.</p>
    `,
  });
}


async forgotPassword(emailRaw: string, roleRaw: string) {
  const email = (emailRaw || "").trim().toLowerCase();

  // Normalize role coming from frontend
  const role = String(roleRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_"); // "Vehicle Seller" -> "vehicle_seller"

  const allowed = new Set([
    "user",
    "admin",
    "vehicle_seller",
    "service_seller",
    "spare_parts_seller",
  ]);
  if (!allowed.has(role)) {
    throw new BadRequestException("Invalid role");
  }

  // Query with email ONLY is ok, but compare using normalized role
  const user = await this.users.findOne({ where: { email } });
  if (!user || user.role !== role) {
    throw new BadRequestException("Account not found for this role");
  }

  const otp = this.genOtp();
  const otpHash = await bcrypt.hash(otp, 12);

  const pr = new PasswordResetEntity();
  pr.email = email;
  pr.role = role; // ✅ normalized value stored
  pr.otpHash = otpHash;
  pr.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  pr.consumedAt = null;
  pr.resetTokenHash = null;

  await this.resets.save(pr);
  await this.sendOtpEmail(email, otp);

  return { ok: true };
}


async verifyOtp(emailRaw: string, role: string, otp: string) {
  const email = emailRaw.trim().toLowerCase();

  // Fetch recent OTP requests for this user+role
  const recent = await this.resets.find({
    where: { email, role },
    order: { createdAt: 'DESC' },
    take: 5, // small + safe
  });

  if (!recent.length) {
    throw new BadRequestException('No OTP request found');
  }

  // find latest unconsumed & unexpired OTP
  const now = Date.now();
  let match: PasswordResetEntity | null = null;

  for (const r of recent) {
    if (r.consumedAt) continue;
    if (r.expiresAt.getTime() < now) continue;

    const ok = await bcrypt.compare(otp, r.otpHash);
    if (ok) {
      match = r;
      break;
    }
  }

  if (!match) {
    throw new BadRequestException('Invalid or expired OTP');
  }

  // generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  match.resetTokenHash = await bcrypt.hash(resetToken, 12);
  match.consumedAt = new Date();

  await this.resets.save(match);

  return { resetToken };
}


async resetPassword(resetToken: string, newPassword: string) {
  // Fetch recent reset records (small batch)
  const recent = await this.resets.find({
    order: { createdAt: 'DESC' },
    take: 50,
  });

  let match: PasswordResetEntity | null = null;

  for (const r of recent) {
    if (!r.resetTokenHash) continue;
    const ok = await bcrypt.compare(resetToken, r.resetTokenHash);
    if (ok) {
      match = r;
      break;
    }
  }

  if (!match) {
    throw new BadRequestException('Invalid or expired reset token');
  }

  const user = await this.users.findOne({
    where: { email: match.email },
  });

  if (!user || user.role !== match.role) {
    throw new BadRequestException('Account not found');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.refreshTokenHash = null; // force re-login
  await this.users.save(user);

  return { ok: true };
}

//


async updateMe(userId: string, dto: { name?: string }) {
  const user = await this.users.findOne({ where: { id: userId } });
  if (!user) throw new BadRequestException('User not found');

  if (dto.name) user.name = dto.name.trim();
  await this.users.save(user);

  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

async changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await this.users.findOne({ where: { id: userId } });
  if (!user) throw new BadRequestException('User not found');

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) throw new BadRequestException('Old password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await this.users.save(user);

  return { ok: true };
}
//

}
