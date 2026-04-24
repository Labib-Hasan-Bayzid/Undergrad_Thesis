import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordEntity } from './entities/record.entity';
import { RecordFile, FileCategory } from './entities/record-file.entity';
import { CreateRecordDto } from './dto/create-record.dto';
import { FileAccessOtp, OtpPurpose } from './entities/file-access-otp.entity';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../auth/mail.service';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PqcBridgeService } from './pqc-bridge.service';

type Uploaded = Express.Multer.File;

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(RecordEntity) private recordRepo: Repository<RecordEntity>,
    @InjectRepository(RecordFile) private fileRepo: Repository<RecordFile>,
    @InjectRepository(FileAccessOtp) private fileOtpRepo: Repository<FileAccessOtp>,
    private jwt: JwtService,
    private mail: MailService,
    private pqcBridge: PqcBridgeService,
  ) {}

  private getPendingDir() {
    const dir = path.join(process.cwd(), 'storage', 'record_file_pending');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getDownloadDir() {
    const dir = path.join(process.cwd(), 'storage', 'record_file_downloads');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private writeTempFile(originalName: string, buffer: Buffer) {
    const safeName = `${crypto.randomUUID()}-${originalName.replace(/[^\w.\-]+/g, '_')}`;
    const fullPath = path.join(this.getPendingDir(), safeName);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  private buildBankTxt(dto: CreateRecordDto) {
    return [
      `recordName=${dto.recordName || ''}`,
      `bankName=${dto.bankName || ''}`,
      `accountHolderName=${dto.accountHolderName || ''}`,
      `accountNumber=${dto.accountNumber || ''}`,
      `routingNumber=${dto.routingNumber || ''}`,
    ].join('\n');
  }

  async create(ownerUserId: string, dto: CreateRecordDto, filesByCategory: Partial<Record<FileCategory, Uploaded[]>>) {
    const record = this.recordRepo.create({
      ownerUserId,
      ...dto,
      bankModelFileId: null,
      bankStorageStatus: 'pending_model',
    });

    try {
      await this.recordRepo.save(record);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException('Record name already exists');
      }
      throw new BadRequestException(err?.message || 'DB error');
    }

    const rows: RecordFile[] = [];

    for (const [cat, files] of Object.entries(filesByCategory) as [FileCategory, Uploaded[]][]) {
      for (const f of files || []) {
        const tempPath = this.writeTempFile(f.originalname, f.buffer);

        let modelFileId: string | null = null;
        let storageStatus = 'pending_model';

        try {
  modelFileId = await this.pqcBridge.uploadFileFromWindowsPath(tempPath);
  storageStatus = 'stored_in_model';

  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch {}
} catch (e: any) {
  console.error(`Vault file upload failed [${f.originalname}]:`, e?.message || e);
  throw new BadRequestException(`Vault file encryption failed for ${f.originalname}`);
}

        rows.push(
          this.fileRepo.create({
            ownerUserId,
            recordId: record.id,
            category: cat,
            originalName: f.originalname,
            mimeType: f.mimetype,
            sizeBytes: String(f.size),
            ciphertext: null,
            cryptoMeta: { mode: 'PQC_MODEL', uploadedAt: new Date().toISOString() },
            modelFileId,
            storageStatus,
            pendingLocalPath: tempPath,
          }),
        );
      }
    }

    if (rows.length) {
      await this.fileRepo.save(rows);
    }

    const hasAnyBank =
      !!dto.bankName?.trim() ||
      !!dto.accountHolderName?.trim() ||
      !!dto.accountNumber?.trim() ||
      !!dto.routingNumber?.trim();

    if (hasAnyBank) {
      const bankTxt = this.buildBankTxt(dto);
      const bankTempName = `${crypto.randomUUID()}-bank-details.txt`;
      const bankTempPath = path.join(this.getPendingDir(), bankTempName);
      fs.writeFileSync(bankTempPath, bankTxt, 'utf8');

      try {
  const bankModelFileId = await this.pqcBridge.uploadFileFromWindowsPath(bankTempPath);
  record.bankModelFileId = bankModelFileId;
  record.bankStorageStatus = 'stored_in_model';

  try {
    if (fs.existsSync(bankTempPath)) {
      fs.unlinkSync(bankTempPath);
    }
  } catch {}
} catch (e: any) {
  console.error('Bank details upload failed:', e?.message || e);
  throw new BadRequestException('Bank details encryption failed');
}

      await this.recordRepo.save(record);
    }

    return this.getOne(ownerUserId, record.id);
  }

  async list(ownerUserId: string) {
    return this.recordRepo.find({ where: { ownerUserId }, order: { createdAt: 'DESC' } });
  }

  async getOne(ownerUserId: string, recordId: string) {
    const record = await this.recordRepo.findOne({
      where: { id: recordId, ownerUserId },
      relations: ['files'],
    });
    if (!record) throw new BadRequestException('Record not found');
    return record;
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async requestActionOtp(ownerUserId: string, email: string, targetId: string, purpose: OtpPurpose) {
    if (!email) throw new BadRequestException('Email missing in JWT payload');

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    await this.fileOtpRepo.save(
      this.fileOtpRepo.create({
        ownerUserId,
        targetId,
        purpose,
        otpHash,
        expiresAt,
        used: false,
      }),
    );

    await this.mail.sendOtp(email, otp);
    return { message: 'OTP sent (if email exists).' };
  }

  async verifyActionOtp(ownerUserId: string, targetId: string, purpose: OtpPurpose, otp: string) {
    const record = await this.fileOtpRepo.findOne({
      where: { ownerUserId, targetId, purpose, used: false },
      order: { createdAt: 'DESC' },
    });

    if (!record) throw new BadRequestException('Invalid OTP');
    if (record.expiresAt.getTime() < Date.now()) throw new BadRequestException('OTP expired');

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) throw new BadRequestException('Invalid OTP');

    record.used = true;
    await this.fileOtpRepo.save(record);

    const actionToken = this.jwt.sign(
      {
        sub: ownerUserId,
        purpose,
        targetId,
        aud: 'file-access',
      },
      { expiresIn: '2m' },
    );

    return { actionToken, expiresInSeconds: 120 };
  }

  verifyActionToken(actionToken: string, ownerUserId: string, targetId: string, purpose: OtpPurpose) {
    try {
      const payload: any = this.jwt.verify(actionToken);

      if (payload?.aud !== 'file-access') throw new UnauthorizedException('Invalid action token');
      if (payload?.sub !== ownerUserId) throw new UnauthorizedException('Invalid action token');
      if (payload?.targetId !== targetId) throw new UnauthorizedException('Invalid action token');
      if (payload?.purpose !== purpose) throw new UnauthorizedException('Invalid action token');

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired action token');
    }
  }

  async getFileMeta(ownerUserId: string, fileId: string) {
    const f = await this.fileRepo.findOne({ where: { id: fileId, ownerUserId } });
    if (!f) throw new BadRequestException('File not found');

    return {
      id: f.id,
      recordId: f.recordId,
      category: f.category,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      cryptoMeta: f.cryptoMeta ?? null,
      modelFileId: f.modelFileId ?? null,
      storageStatus: f.storageStatus,
      createdAt: f.createdAt,
    };
  }

 async getFileForDownload(ownerUserId: string, fileId: string) {
  const f = await this.fileRepo.findOne({ where: { id: fileId, ownerUserId } });
  if (!f) throw new BadRequestException('File not found');
  if (!f.modelFileId) throw new BadRequestException('Encrypted model file not found');

  const out = await this.pqcBridge.downloadToWindowsDir(
    f.modelFileId,
    this.getDownloadDir(),
  );

  return {
    originalName: f.originalName,
    mimeType: f.mimeType || 'application/octet-stream',
    outputPath: out.outputPath, // already full file path
  };
}

  async getBankDetailsForView(ownerUserId: string, recordId: string) {
    const record = await this.recordRepo.findOne({ where: { id: recordId, ownerUserId } });
    if (!record) throw new BadRequestException('Record not found');
    if (!record.bankModelFileId) throw new BadRequestException('Encrypted bank file not found');

    const out = await this.pqcBridge.downloadToWindowsDir(record.bankModelFileId, this.getDownloadDir());
    const content = fs.readFileSync(out.outputPath, 'utf8');

    try {
      if (fs.existsSync(out.outputPath)) fs.unlinkSync(out.outputPath);
    } catch {}

    const lines = Object.fromEntries(
      content
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf('=');
          if (idx < 0) return [line, ''];
          return [line.slice(0, idx), line.slice(idx + 1)];
        }),
    );

    return {
      bankName: lines.bankName || '—',
      accountHolderName: lines.accountHolderName || '—',
      accountNumber: lines.accountNumber || '—',
      routingNumber: lines.routingNumber || '—',
    };
  }
}