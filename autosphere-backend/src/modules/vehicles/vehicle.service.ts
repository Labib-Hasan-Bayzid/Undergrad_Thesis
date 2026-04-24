import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleImageEntity } from './vehicle-image.entity';
import { UserEntity } from '../users/user.entity';
//
type VehicleListItem = {
  id: string;
  sellerId: string;
  title: string;
  vehicleType: 'car' | 'bike';
  brand: string | null;
  year: number | null;
  condition: 'new' | 'used' | 'recondition';
  price: number;
  city: string;
  phone: string;
  location: string;
  description: string | null;
  status: 'available' | 'sold' | 'hidden';
  createdAt: Date;
  updatedAt: Date;
  coverImageId: string | null;
  coverImageUrl: string | null;
   imageUrls: string[];
};

//

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehicles: Repository<VehicleEntity>,
     @InjectRepository(VehicleImageEntity) private readonly images: Repository<VehicleImageEntity>,
      @InjectRepository(UserEntity)
  private readonly users: Repository<UserEntity>,
  ) {}

//
private async ensureVerifiedSeller(sellerId: string) {
  const user = await this.users.findOne({ where: { id: sellerId } });
  if (!user) throw new ForbiddenException('User not found');

  if (user.role !== 'vehicle_seller') {
    throw new ForbiddenException('Only vehicle sellers can manage vehicle listings');
  }

  if (!user.isVerified) {
    throw new ForbiddenException('Your seller account is pending admin verification');
  }

  if (user.isBlocked) {
    throw new ForbiddenException('Your account is blocked');
  }

  return user;
}



  async create(sellerId: string, dto: CreateVehicleDto, files: Express.Multer.File[] = []) {
    await this.ensureVerifiedSeller(sellerId);
  const vehicle = new VehicleEntity();
  vehicle.sellerId = sellerId;
  Object.assign(vehicle, dto);

  const saved = await this.vehicles.save(vehicle);

  // save images
  if (files.length) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const picked = files.slice(0, 8); // max 8 images

    for (let i = 0; i < picked.length; i++) {
      const f = picked[i];
      if (!allowed.includes(f.mimetype)) continue;

      const img = new VehicleImageEntity();
      img.vehicleId = saved.id;
      img.mime = f.mimetype;
      img.originalName = f.originalname;
      img.bytes = f.buffer;
      img.sortOrder = i;
      img.isCover = i === 0; // first image = cover
      await this.images.save(img);
    }
  }

  return this.getOneForOwner(saved.id, sellerId);
}

//

//

//
  private toListDto(v: VehicleEntity, coverId: string | undefined, imageIds: string[]): VehicleListItem {
  const imageUrls = imageIds.map((id) => `/vehicles/${v.id}/images/${id}`);

  return {
    id: v.id,
    sellerId: v.sellerId,
    title: v.title,
    vehicleType: v.vehicleType,
    brand: v.brand,
    year: v.year,
    condition: v.condition,
    price: v.price,
    city: v.city,
    phone: v.phone,
    location: v.location,
    description: v.description,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    coverImageId: coverId || null,
    coverImageUrl: coverId ? `/vehicles/${v.id}/images/${coverId}` : null,

    // ✅ ADD
    imageUrls,
  };
}


//
async getOneForOwner(id: string, sellerId: string) {
  const v = await this.vehicles.findOne({ where: { id } });
  if (!v) throw new NotFoundException('Vehicle not found');
  if (v.sellerId !== sellerId) throw new ForbiddenException();

 const imgs = await this.images.find({
  where: { vehicleId: id },
  order: { sortOrder: 'ASC' },
});

const cover = imgs.find((x) => x.isCover) || imgs[0];
const imageIds = imgs.map((x) => x.id);

return this.toListDto(v, cover?.id, imageIds);

}
//
  async findMine(sellerId: string): Promise<VehicleListItem[]> {
  const vs = await this.vehicles.find({
    where: { sellerId },
    order: { createdAt: 'DESC' },
  });

  const out: VehicleListItem[] = [];

  for (const v of vs) {
  const imgs = await this.images.find({
    where: { vehicleId: v.id },
    order: { sortOrder: 'ASC' },
  });

  const cover = imgs.find((x) => x.isCover) || imgs[0];
  const imageIds = imgs.map((x) => x.id);

  out.push(this.toListDto(v, cover?.id, imageIds));
}


  return out;
}


  async findPublic(): Promise<VehicleListItem[]> {
  const vs = await this.vehicles.find({
    where: { status: 'available' },
    order: { createdAt: 'DESC' },
  });

  const out: VehicleListItem[] = [];

  for (const v of vs) {
  const imgs = await this.images.find({
    where: { vehicleId: v.id },
    order: { sortOrder: 'ASC' },
  });

  const cover = imgs.find((x) => x.isCover) || imgs[0];
  const imageIds = imgs.map((x) => x.id);

  out.push(this.toListDto(v, cover?.id, imageIds));
}


  return out;
}




//
async getImage(vehicleId: string, imageId: string) {
  const img = await this.images.findOne({ where: { id: imageId, vehicleId } });
  if (!img) throw new NotFoundException('Image not found');
  return img;
}

//

  async update(id: string, sellerId: string, dto: UpdateVehicleDto) {
    await this.ensureVerifiedSeller(sellerId);
    const vehicle = await this.vehicles.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.sellerId !== sellerId) throw new ForbiddenException();

    Object.assign(vehicle, dto);
    return this.vehicles.save(vehicle);
  }

  async updateStatus(id: string, sellerId: string, status: 'available' | 'sold' | 'hidden') {
    await this.ensureVerifiedSeller(sellerId);
    const vehicle = await this.vehicles.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException();
    if (vehicle.sellerId !== sellerId) throw new ForbiddenException();

    vehicle.status = status;
    return this.vehicles.save(vehicle);
  }

  async remove(id: string, sellerId: string) {
    await this.ensureVerifiedSeller(sellerId);
    const vehicle = await this.vehicles.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException();
    if (vehicle.sellerId !== sellerId) throw new ForbiddenException();

    await this.vehicles.remove(vehicle);
    return { ok: true };
  }
  



  //
}
