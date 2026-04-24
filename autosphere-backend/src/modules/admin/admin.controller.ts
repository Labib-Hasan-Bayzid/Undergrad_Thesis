import { Body, Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('metrics')
  metrics() {
    return this.svc.metrics();
  }

  @Get('users')
  users() {
    return this.svc.listUsers();
  }

  @Patch('users/:id/block')
  block(@Param('id') id: string, @Body() body: { blocked: boolean }) {
    return this.svc.setUserBlocked(id, !!body.blocked);
  }

  @Get('sellers')
  sellers(@Query('type') type: 'vehicle' | 'workshop' | 'all' = 'all') {
    return this.svc.listSellers(type);
  }

  @Patch('sellers/:id/verify')
  verify(@Param('id') id: string, @Body() body: { verified: boolean }) {
    return this.svc.setSellerVerified(id, !!body.verified);
  }

 
@Get('records/vehicle-sales')
vehicleSales(@Query('limit') limit = '5') {
  return this.svc.recentVehicleSales(Number(limit) || 5);
}

//
@Get('records/bookings')
bookings(@Query('limit') limit = '5') {
  return this.svc.recentWorkshopBookings(Number(limit || 5));
}
//
@Get('records/subscriptions')
subscriptions(@Query('limit') limit = '5') {
  return this.svc.recentSubscriptions(Number(limit) || 5);
}

//
@Get('sellers/:id/document/:kind')
async downloadSellerDocument(
  @Param('id') id: string,
  @Param('kind') kind: 'trade' | 'tax',
  @Res() res: Response,
) {
  const file = await this.svc.getSellerDocForDownload(id, kind);

  return res.download(file.outputPath, file.originalName, () => {
    try {
      if (fs.existsSync(file.outputPath)) {
        fs.unlinkSync(file.outputPath);
      }
    } catch {}
  });
}

}
