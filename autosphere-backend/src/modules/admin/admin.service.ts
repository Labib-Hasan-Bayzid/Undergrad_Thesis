import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { ServiceListingEntity } from '../services/services.entity';
import { PaymentOrderEntity } from '../payments/payment-order.entity';
import { SubscriptionEntity } from '../subscriptions/subscription.entity';
import { PqcBridgeService } from '../auth/pqc-bridge.service';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';


@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(VehicleEntity) private readonly vehicles: Repository<VehicleEntity>,
    @InjectRepository(ServiceListingEntity) private readonly services: Repository<ServiceListingEntity>,
 @InjectRepository(PaymentOrderEntity) private readonly payments: Repository<PaymentOrderEntity>,
 @InjectRepository(SubscriptionEntity)
private readonly subs: Repository<SubscriptionEntity>,
private readonly pqcBridge: PqcBridgeService,
  ) {}

 async metrics() {
  const totalUsers = await this.users.count();

  const verifiedSellers = await this.users.count({
    where: { role: In(['vehicle_seller', 'service_seller', 'spare_parts_seller']), isVerified: true },
  });
//
 // Vehicles available (you asked: "available should load total status available")
  const vmAvailable = await this.vehicles.count({ where: { status: 'available' as any } });
  const activeVehicleListings = await this.vehicles.count({ where: { status: 'available' as any } });
  const activeServiceListings = await this.services.count({ where: { status: 'available' as any } });

  // ✅ all paid orders in DB
  const paymentsRecorded = await this.payments.count({
    where: { status: 'paid' as any },
  });


  //
  const now = new Date();

const avActive = await this.subs
  .createQueryBuilder('s')
  .where('s.active = true')
  .andWhere('s."endsAt" > :now', { now })
  .getCount();

const avExpired = await this.subs
  .createQueryBuilder('s')
  .where('s."endsAt" <= :now', { now })
  .getCount();

const avPlansRaw = await this.subs
  .createQueryBuilder('s')
  .select('DISTINCT s.plan', 'plan')
  .getRawMany();

const avPlans = avPlansRaw.length;
  //
   // ✅ Workshops bookings = paid orders with buyer + source workshops*
  const wsBookings = await this.payments
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po.buyerId IS NOT NULL')
    .andWhere('po.source ILIKE :src', { src: 'workshop%' })
    .getCount();

  // ✅ SOLD for Vehicle Marketplace block:
  // paid + buyerId not null + source starts with "marketplace"
  const vmSold = await this.payments
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po."buyerId" IS NOT NULL')
    .andWhere('po.source ILIKE :src', { src: 'marketplace%' })
    .getCount();

  const vmSellers = await this.users.count({ where: { role: 'vehicle_seller' as any } });
  const vmPending = await this.users.count({
    where: { role: 'vehicle_seller' as any, isVerified: false as any },
  });

  const wsSellers = await this.users.count({
    where: { role: In(['service_seller', 'spare_parts_seller']) as any },
  });

  return {
    totalUsers,
    verifiedSellers,
    activeListings: activeVehicleListings + activeServiceListings,

    // ✅ KPI
    paymentsRecorded,

    // placeholders you said you'll wire later
   avActive,
avExpired,
avPlans,

    // ✅ Vehicle marketplace minis
    vmSellers,
    vmPending,
    vmSold,
    vmAvailable,

    // ✅ Workshops minis
    wsSellers,
    wsBookings: wsBookings,
    wsItems: await this.services.count(),

  };
}

//
private getAdminDownloadDir() {
  const dir = path.join(process.cwd(), 'storage', 'admin_seller_doc_downloads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async getSellerDocForDownload(userId: string, kind: 'trade' | 'tax') {
  const user = await this.users.findOne({ where: { id: userId } });
  if (!user) throw new BadRequestException('Seller not found');

  const isSeller =
    user.role === 'vehicle_seller' ||
    user.role === 'service_seller' ||
    user.role === 'spare_parts_seller';

  if (!isSeller) throw new BadRequestException('User is not a seller');

  const modelFileId =
    kind === 'trade' ? user.tradeLicenseModelFileId : user.incomeTaxModelFileId;

  const originalName =
    kind === 'trade' ? user.tradeLicenseName : user.incomeTaxName;

  const mimeType =
    kind === 'trade' ? user.tradeLicenseMime : user.incomeTaxMime;

  if (!modelFileId) {
    throw new BadRequestException('Encrypted document not found');
  }

  const out = await this.pqcBridge.downloadToWindowsDir(
    modelFileId,
    this.getAdminDownloadDir(),
  );

  return {
    outputPath: out.outputPath,
    originalName: originalName || (kind === 'trade' ? 'trade-license.bin' : 'income-tax.bin'),
    mimeType: mimeType || 'application/octet-stream',
  };
}
//
async recentSubscriptions(limit = 5) {
  const take = Math.max(1, Math.min(50, Number(limit) || 5));

  const rows = await this.subs.find({
    order: { updatedAt: 'DESC' },
    take,
  });

  const now = Date.now();

  return rows.map((s) => {
    const active = !!s.active && new Date(s.endsAt).getTime() > now;
    return {
            user: s.vaultEmail || s.vaultUserId,

     // user: s.vaultUserId, // you can later map to email/name if you store it
      plan: String(s.plan || '').toUpperCase(),
      status: active ? 'Active' : 'Expired',
      ends: new Date(s.endsAt).toISOString().slice(0, 10),
      createdAt: new Date(s.createdAt).getTime(),
    };
  });
}
//
async recentWorkshopBookings(limit = 5) {
  const rows = await this.payments
    .createQueryBuilder('po')
    .leftJoin(UserEntity, 'buyer', 'buyer.id = po.buyerId')
    .leftJoin(UserEntity, 'seller', 'seller.id = (po.items->0->>\'sellerId\')::uuid')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po.buyerId IS NOT NULL')
    .andWhere('po.source ILIKE :src', { src: 'workshop%' })
    .orderBy('po.createdAt', 'DESC')
    .limit(Math.max(1, Math.min(50, Number(limit || 5))))
    .select([
      'po.id as id',
      'po.createdAt as "createdAt"',
      'po.items as items',
      'buyer.name as "buyerName"',
      'seller.name as "sellerName"',
    ])
    .getRawMany();

  return (rows || []).map((r: any) => {
    const items = Array.isArray(r.items) ? r.items : [];
    const first = items[0] || {};
    return {
      id: r.id,
      service: first.title || first.id || '—',
      workshop: r.sellerName || first.sellerId || '—',
      user: r.buyerName || '—',
      status: 'Completed', // paid = completed in your UI
      createdAt: r.createdAt,
    };
  });
}



  async listUsers() {
    return this.users.find({
      select: ['id', 'name', 'email', 'phone', 'city', 'role', 'isBlocked', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async setUserBlocked(id: string, blocked: boolean) {
    await this.users.update({ id }, { isBlocked: blocked });
    return { ok: true };
  }

  async listSellers(type: 'vehicle' | 'workshop' | 'all') {
    let roles: any[] = [];
    if (type === 'vehicle') roles = ['vehicle_seller'];
    else if (type === 'workshop') roles = ['service_seller', 'spare_parts_seller'];
    else roles = ['vehicle_seller', 'service_seller', 'spare_parts_seller'];

    const sellers = await this.users.find({
      where: { role: In(roles as any) },
      select: [
        'id',
        'name',
        'email',
        'phone',
        'city',
        'role',
        'isVerified',
        'sellerLocation',
        'sellerContact',
        'sellerTin',
        'createdAt',
        'tradeLicenseName',
'tradeLicenseMime',
'tradeLicenseModelFileId',
'tradeLicenseStorageStatus',
'incomeTaxName',
'incomeTaxMime',
'incomeTaxModelFileId',
'incomeTaxStorageStatus',
      ],
      order: { createdAt: 'DESC' },
    });

    return sellers.map((u) => ({
      id: u.id,
      type: u.role === 'vehicle_seller' ? 'vehicle' : 'workshop',
      name: u.name,
      phone: u.phone,
      city: u.city,
      role: u.role,
      isVerified: u.isVerified,
      sellerLocation: u.sellerLocation,
      sellerContact: u.sellerContact,
      sellerTin: u.sellerTin,
      createdAt: u.createdAt,
      tradeLicenseName: u.tradeLicenseName,
  tradeLicenseMime: u.tradeLicenseMime,
  hasTradeLicense: !!u.tradeLicenseModelFileId,
  tradeLicenseStorageStatus: u.tradeLicenseStorageStatus,

  incomeTaxName: u.incomeTaxName,
  incomeTaxMime: u.incomeTaxMime,
  hasIncomeTax: !!u.incomeTaxModelFileId,
  incomeTaxStorageStatus: u.incomeTaxStorageStatus,
    }));
  }

  async setSellerVerified(id: string, verified: boolean) {
    await this.users.update({ id }, { isVerified: verified });
    return { ok: true };
  }
//

async recentVehicleSales(limit = 5) {
  const take = Math.max(1, Math.min(50, Number(limit) || 5));

  // paid marketplace orders, buyer must exist
  const orders = await this.payments
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po.buyerId IS NOT NULL')
    .andWhere('po.source ILIKE :src', { src: 'marketplace%' }) // supports marketplace / marketplace/...
    .orderBy('po.createdAt', 'DESC')
    .take(take)
    .getMany();

  const rows: Array<{
    listing: string;
    seller: string;
    buyer: string;
    status: string;
    createdAt: string;
  }> = [];

  const sellerIds = new Set<string>();
  const buyerIds = new Set<string>();

  for (const o of orders) {
    if (o.buyerId) buyerIds.add(o.buyerId);

    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      // ✅ ONLY vehicles in Vehicle Sales tab
      if ((it?.kind || '').toLowerCase() !== 'vehicle') continue;
      if (it?.sellerId) sellerIds.add(it.sellerId);
    }
  }

  const allIds = Array.from(new Set([...sellerIds, ...buyerIds]));
  const people = allIds.length
    ? await this.users.find({
        where: { id: In(allIds as any) } as any,
        select: ['id', 'name'] as any,
      } as any)
    : [];

  const nameById = new Map<string, string>();
  for (const p of people) nameById.set(p.id, p.name || '—');

  for (const o of orders) {
    const buyerName = o.buyerId ? (nameById.get(o.buyerId) || '—') : '—';
    const items = Array.isArray(o.items) ? o.items : [];

    for (const it of items) {
      if ((it?.kind || '').toLowerCase() !== 'vehicle') continue;

      rows.push({
        listing: String(it?.title || it?.id || '—'),
        seller: it?.sellerId ? (nameById.get(it.sellerId) || '—') : '—',
        buyer: buyerName,
        status: 'Sold',
        createdAt: o.createdAt?.toISOString?.() || new Date().toISOString(),
      });
    }
  }

  return rows.slice(0, take);
}


//
async recentMarketplaceSales(limit = 5) {
  const orders = await this.payments
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po.buyerId IS NOT NULL')
    .andWhere('po.source ILIKE :src', { src: 'marketplace%' })
    .orderBy('po.createdAt', 'DESC')
    .take(Math.min(Math.max(Number(limit) || 5, 1), 50))
    .getMany();

  // collect sellerIds from first item (or all items if you want later)
  const sellerIds = new Set<string>();
  const buyerIds = new Set<string>();

  for (const o of orders) {
    if (o.buyerId) buyerIds.add(o.buyerId);
    const items = Array.isArray(o.items) ? o.items : [];
    const first = items[0];
    if (first?.sellerId) sellerIds.add(first.sellerId);
  }

  const userIds = [...sellerIds, ...buyerIds];
  const users = userIds.length
    ? await this.users.find({ where: { id: In(userIds) } as any, select: ['id', 'name', 'email'] as any })
    : [];

  const uMap = new Map(users.map((u: any) => [u.id, u]));

  return orders.map((o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    const first = items[0] || {};
    const seller = first?.sellerId ? uMap.get(first.sellerId) : null;
    const buyer = o.buyerId ? uMap.get(o.buyerId) : null;

    return {
      listing: first?.title || first?.id || o.id,
      seller: seller?.name || '—',
      buyer: buyer?.name || '—',
      status: 'Sold', // paid + buyerId => sold
      createdAt: o.createdAt,
      amount: o.amount,
      orderId: o.id,
    };
  });
}



//
}
