import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardEntity } from './card.entity';
import { CreateCardDto } from './dto/create-card.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { UserEntity } from '../users/user.entity';
import { PqcBridgeService } from './pqc-bridge.service';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly cardsRepo: Repository<CardEntity>,

    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,

    private readonly pqcBridge: PqcBridgeService,
  ) {}

  private onlyDigits(v: string) {
    return String(v || '').replace(/\D/g, '');
  }

  private ensureUserRole(user: UserEntity | null) {
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'user') {
      throw new ForbiddenException('Only normal users can save card details');
    }
  }

  private getPendingDir() {
    const dir = path.join(process.cwd(), 'storage', 'card_txt_pending');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getDownloadDir() {
    const dir = path.join(process.cwd(), 'storage', 'card_txt_downloads');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private buildCardTxt(dto: CreateCardDto) {
    return [
      `label=${dto.label}`,
      `holderName=${dto.holderName}`,
      `cardNumber=${dto.cardNumber}`,
      `expMonth=${dto.expMonth}`,
      `expYear=${dto.expYear}`,
      `cvv=${dto.cvv}`,
      `billingAddress=${dto.billingAddress || ''}`,
    ].join('\n');
  }

  async create(userId: string, dto: CreateCardDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    this.ensureUserRole(user);

    const cardNumber = this.onlyDigits(dto.cardNumber);
    const cvv = this.onlyDigits(dto.cvv);

    if (cardNumber.length < 13 || cardNumber.length > 16) {
      throw new BadRequestException('Invalid card number');
    }
    if (cvv.length < 3 || cvv.length > 4) {
      throw new BadRequestException('Invalid CVV');
    }

    const txtContent = this.buildCardTxt({
      ...dto,
      cardNumber,
      cvv,
    });

    const txtId = crypto.randomUUID();
    const txtName = `${txtId}.txt`;
    const txtPath = path.join(this.getPendingDir(), txtName);

    fs.writeFileSync(txtPath, txtContent, 'utf8');

    let modelFileId: string | null = null;
    let status = 'pending_model';

  try {
  modelFileId = await this.pqcBridge.uploadFileFromWindowsPath(txtPath);
  status = 'stored_in_model';

  try {
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
  } catch {}
} catch (e: any) {
  console.error('PQC upload failed:', e?.message || e);
  throw new BadRequestException(`PQC upload failed: ${e?.message || e}`);
}

    const card = new CardEntity();
    card.userId = userId;
    card.label = dto.label.trim();
    card.holderName = dto.holderName.trim();
    card.last4 = cardNumber.slice(-4);
    card.expMonth = dto.expMonth;
    card.expYear = dto.expYear;
    card.billingAddress = dto.billingAddress?.trim() || null;
    card.status = status;
    card.pendingTxtPath = null;
    card.modelFileId = modelFileId;

    const saved = await this.cardsRepo.save(card);

    return {
      id: saved.id,
      label: saved.label,
      holderName: saved.holderName,
      last4: saved.last4,
      expMonth: saved.expMonth,
      expYear: saved.expYear,
      billingAddress: saved.billingAddress,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }

  async listMine(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    this.ensureUserRole(user);

    const rows = await this.cardsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((x) => ({
      id: x.id,
      label: x.label,
      holderName: x.holderName,
      cardNumber: `**** **** **** ${x.last4}`,
      expMonth: x.expMonth,
      expYear: x.expYear,
      billingAddress: x.billingAddress,
      status: x.status,
      canView: !!x.modelFileId,
      createdAt: x.createdAt,
    }));
  }

 async remove(userId: string, cardId: string) {
  const user = await this.usersRepo.findOne({ where: { id: userId } });
  this.ensureUserRole(user);

  const row = await this.cardsRepo.findOne({
    where: { id: cardId, userId },
  });

  if (!row) throw new NotFoundException('Saved card not found');

  if (row.modelFileId) {
    try {
      await this.pqcBridge.deleteModelFile(row.modelFileId);
    } catch (e: any) {
      throw new BadRequestException(`Failed to delete model file: ${e?.message || e}`);
    }
  }

  if (row.pendingTxtPath && fs.existsSync(row.pendingTxtPath)) {
    try {
      fs.unlinkSync(row.pendingTxtPath);
    } catch {}
  }

  await this.cardsRepo.remove(row);
  return { ok: true };
}

  async prepareView(userId: string, cardId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    this.ensureUserRole(user);

    const row = await this.cardsRepo.findOne({
      where: { id: cardId, userId },
    });

    if (!row) throw new NotFoundException('Saved card not found');
    if (!row.modelFileId) {
      throw new BadRequestException('This card is not stored in the Python model yet');
    }

    const out = await this.pqcBridge.downloadToWindowsDir(row.modelFileId, this.getDownloadDir());

    return {
      filePath: out.outputPath,
      downloadName: `${row.label || 'card-details'}.txt`,
    };
  }
}