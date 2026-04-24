import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { WorkshopBookingsService } from './workshop-bookings.service';

@Controller('workshop-bookings')
export class WorkshopBookingsController {
  constructor(private readonly svc: WorkshopBookingsService) {}

  @UseGuards(JwtGuard)
  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.svc.createPending(req.user.sub, body);
  }
}