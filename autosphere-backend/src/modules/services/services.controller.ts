import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard'; // adjust if your path differs
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly svc: ServicesService) {}

  @UseGuards(JwtGuard)
  @Get('my')
  findMine(@Req() req: any) {
    return this.svc.findMine(req.user.sub);
  }

  @UseGuards(JwtGuard)
  @Post()
  @UseInterceptors(FilesInterceptor('images', 8, { limits: { fileSize: 3 * 1024 * 1024 } }))
  create(@Req() req: any, @Body() dto: CreateServiceListingDto, @Req() r2: any) {
    // Nest puts files in req.files for FilesInterceptor
    return this.svc.create(req.user.sub, dto, (r2.files || []) as any);
  }

  @UseGuards(JwtGuard)
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateServiceListingDto) {
    return this.svc.update(id, req.user.sub, dto);
  }

  @UseGuards(JwtGuard)
  @Patch(':id/status/:status')
  setStatus(@Req() req: any, @Param('id') id: string, @Param('status') status: any) {
    return this.svc.setStatus(id, req.user.sub, status);
  }

  @UseGuards(JwtGuard)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(id, req.user.sub);
  }

  @Get(':id/images/:imageId')
  async getImage(@Param('id') listingId: string, @Param('imageId') imageId: string, @Res() res: Response) {
    const img = await this.svc.getImage(listingId, imageId);
    res.setHeader('Content-Type', img.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(img.bytes);
  }
@Get()
findPublic() {
  return this.svc.findPublic();
}

@Get('workshops')
listWorkshops() {
  return this.svc.listWorkshops();
}


@Get('workshops/:sellerId/listings')
findBySeller(@Param('sellerId') sellerId: string) {
  return this.svc.findBySeller(sellerId);
}



}

