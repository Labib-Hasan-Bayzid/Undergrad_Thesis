import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { ServiceImageEntity } from './services-image.entity';
import { ServiceListingEntity, ServiceStatus } from './services.entity';
import { UserEntity } from '../users/user.entity'; // adjust path if your user entity location differs
import { WorkshopListItem } from './dto/workshop-list.dto';
import { In } from 'typeorm'; // add at top if not already



type ServiceListItem = {
  id: string;
  sellerId: string;
  title: string;
  category: 'service' | 'part';
  vehicleSupport: 'car' | 'bike' | 'both';
  price: number;
  city: string;
  phone: string;
  location: string;
  description: string | null;

  serviceType: string | null;
  partCategory: string | null;
  partCondition: string | null;
  stock: number | null;

  status: ServiceStatus;
  createdAt: Date;
  updatedAt: Date;

  coverImageUrl: string | null;
  imageUrls: string[];
};

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceListingEntity) private readonly listings: Repository<ServiceListingEntity>,
    @InjectRepository(ServiceImageEntity) private readonly images: Repository<ServiceImageEntity>,
  @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  //
private async ensureVerifiedSeller(sellerId: string) {
  const user = await this.users.findOne({ where: { id: sellerId } });
  if (!user) throw new ForbiddenException('User not found');

  const allowed =
    user.role === 'service_seller' || user.role === 'spare_parts_seller';

  if (!allowed) {
    throw new ForbiddenException('Only workshop sellers can manage these listings');
  }

  if (!user.isVerified) {
    throw new ForbiddenException('Your seller account is pending admin verification');
  }

  if (user.isBlocked) {
    throw new ForbiddenException('Your account is blocked');
  }

  return user;
}
  //

  private toDto(l: ServiceListingEntity, imageIds: string[]): ServiceListItem {
    const coverId = imageIds[0];
    return {
      id: l.id,
      sellerId: l.sellerId,
      title: l.title,
      category: l.category,
      vehicleSupport: l.vehicleSupport,
      price: l.price,
      city: l.city,
      phone: l.phone,
      location: l.location,
      description: l.description ?? null,

      serviceType: l.serviceType ?? null,
      partCategory: l.partCategory ?? null,
      partCondition: l.partCondition ?? null,
      stock: l.stock ?? null,

      status: l.status,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,

      coverImageUrl: coverId ? `/services/${l.id}/images/${coverId}` : null,
      imageUrls: imageIds.map((id) => `/services/${l.id}/images/${id}`),
    };
  }

  async create(sellerId: string, dto: CreateServiceListingDto, files: Express.Multer.File[] = []) {
    await this.ensureVerifiedSeller(sellerId);
    // category sanity
    if (dto.category === 'service' && !dto.serviceType) {
      throw new BadRequestException('serviceType is required for service category');
    }
    if (dto.category === 'part') {
      if (!dto.partCategory) throw new BadRequestException('partCategory is required for part category');
      if (!dto.partCondition) throw new BadRequestException('partCondition is required for part category');
      if (dto.stock === undefined || dto.stock === null) throw new BadRequestException('stock is required for part category');
    }

    const listing = this.listings.create({
      sellerId,
      title: dto.title,
      category: dto.category,
      vehicleSupport: dto.vehicleSupport,
      price: dto.price,
      city: dto.city,
      phone: dto.phone,
      location: dto.location,
      description: dto.description ?? null,

      serviceType: dto.category === 'service' ? (dto.serviceType ?? null) : null,
      partCategory: dto.category === 'part' ? (dto.partCategory ?? null) : null,
      partCondition: dto.category === 'part' ? (dto.partCondition ?? null) : null,
      stock: dto.category === 'part' ? (dto.stock ?? 0) : null,
      status: 'available',
    });

    const saved = await this.listings.save(listing);

    // save images
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const picked = (files || []).slice(0, 8);

    let sort = 0;
    for (const f of picked) {
      if (!allowed.includes(f.mimetype)) continue;
      const img = this.images.create({
        listingId: saved.id,
        mime: f.mimetype,
        originalName: f.originalname,
        bytes: f.buffer,
        sortOrder: sort,
        isCover: sort === 0,
      });
      await this.images.save(img);
      sort++;
    }

    return this.getOneForOwner(saved.id, sellerId);
  }

  async getOneForOwner(id: string, sellerId: string) {
    const l = await this.listings.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.sellerId !== sellerId) throw new ForbiddenException();

    const imgs = await this.images.find({ where: { listingId: id }, order: { sortOrder: 'ASC' } });
    const imageIds = imgs.map((x) => x.id);

    return this.toDto(l, imageIds);
  }

  async findMine(sellerId: string): Promise<ServiceListItem[]> {
    const ls = await this.listings.find({ where: { sellerId }, order: { createdAt: 'DESC' } });
    const out: ServiceListItem[] = [];

    for (const l of ls) {
      const imgs = await this.images.find({ where: { listingId: l.id }, order: { sortOrder: 'ASC' } });
      out.push(this.toDto(l, imgs.map((x) => x.id)));
    }
    return out;
  }

  async update(id: string, sellerId: string, dto: UpdateServiceListingDto) {
    await this.ensureVerifiedSeller(sellerId);
    const l = await this.listings.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.sellerId !== sellerId) throw new ForbiddenException();

    Object.assign(l, {
      title: dto.title ?? l.title,
      vehicleSupport: (dto.vehicleSupport as any) ?? l.vehicleSupport,
      price: dto.price ?? l.price,
      city: dto.city ?? l.city,
      phone: dto.phone ?? l.phone,
      location: dto.location ?? l.location,
      description: dto.description ?? l.description,
    });
// ✅ allow stock update for parts only
if (l.category === 'part' && dto.stock !== undefined) {
  l.stock = dto.stock;
}

    // keep category stable (simpler)
    await this.listings.save(l);
    return this.getOneForOwner(id, sellerId);
  }

  async setStatus(id: string, sellerId: string, status: ServiceStatus) {
    await this.ensureVerifiedSeller(sellerId);
    const l = await this.listings.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.sellerId !== sellerId) throw new ForbiddenException();

    l.status = status;
    await this.listings.save(l);
    return this.getOneForOwner(id, sellerId);
  }

  async remove(id: string, sellerId: string) {
    await this.ensureVerifiedSeller(sellerId);
    const l = await this.listings.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.sellerId !== sellerId) throw new ForbiddenException();

    await this.listings.delete({ id });
    return { ok: true };
  }

  async getImage(listingId: string, imageId: string) {
    const img = await this.images.findOne({ where: { id: imageId, listingId } });
    if (!img) throw new NotFoundException('Image not found');
    return img;
  }


  //
  async findPublic(): Promise<ServiceListItem[]> {
  const ls = await this.listings.find({
    where: { status: 'available' },
    order: { createdAt: 'DESC' },
  });

  const out: ServiceListItem[] = [];
  for (const l of ls) {
    const imgs = await this.images.find({
      where: { listingId: l.id },
      order: { sortOrder: 'ASC' },
    });
    out.push(this.toDto(l, imgs.map((x) => x.id)));
  }
  return out;
}

//workshop list
// ...

async listWorkshops() {
  // ✅ Return ALL users who are service_seller or spare_parts_seller
  const sellers = await this.users.find({
    where: { role: In(['service_seller', 'spare_parts_seller']) },
    order: { name: 'ASC' },
    select: ['id', 'name', 'role', 'city', 'sellerLocation'], // if these exist in your UserEntity
  } as any);

  return (sellers || []).map((u: any) => ({
    id: u.id,
    name: u.name,
    city: u.city ?? null,
    sellerLocation: u.sellerLocation ?? null,
    role: u.role,
  }));
}

//
async findBySeller(sellerId: string) {
  const ls = await this.listings.find({
    where: { sellerId, status: 'available' }, // show only active in public profile
    order: { createdAt: 'DESC' },
  });

const out: ServiceListItem[] = [];
  for (const l of ls) {
    const imgs = await this.images.find({
      where: { listingId: l.id },
      order: { sortOrder: 'ASC' },
    });
    out.push(this.toDto(l, imgs.map((x) => x.id)));
  }
  return out;
}



}
