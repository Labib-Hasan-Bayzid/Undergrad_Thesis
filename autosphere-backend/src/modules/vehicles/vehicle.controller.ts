import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UseInterceptors, UploadedFiles, BadRequestException, Res } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  // 🌍 Public marketplace
  @Get()
  listPublic() {
    return this.vehicles.findPublic();
  }

  // 🚗 Seller creates listing
  @UseGuards(JwtGuard)
@Post()
@UseInterceptors(
  FilesInterceptor('images', 8, {
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB per image
  }),
)
create(
  @Req() req: any,
  @Body() dto: CreateVehicleDto,
  @UploadedFiles() files: Express.Multer.File[],
) {
  // optional: enforce role here if you want
  // if (req.user.role !== 'vehicle_seller') throw new ForbiddenException();

  return this.vehicles.create(req.user.sub, dto, files || []);
}


  // 📦 Seller listings
  @UseGuards(JwtGuard)
  @Get('my')
  myListings(@Req() req: any) {
    return this.vehicles.findMine(req.user.sub);
  }

  @UseGuards(JwtGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(id, req.user.sub, dto);
  }

  @UseGuards(JwtGuard)
  @Patch(':id/status/:status')
  updateStatus(
    @Param('id') id: string,
    @Param('status') status: 'available' | 'sold' | 'hidden',
    @Req() req: any,
  ) {
    return this.vehicles.updateStatus(id, req.user.sub, status);
  }

  @UseGuards(JwtGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.vehicles.remove(id, req.user.sub);
  }

  //
 @Get(':id/images/:imageId')
async getImage(
  @Param('id') vehicleId: string,
  @Param('imageId') imageId: string,
  @Res() res: Response,
) {
  const img = await this.vehicles.getImage(vehicleId, imageId);

  res.setHeader('Content-Type', img.mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(img.bytes);
}

//
}
