import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get('status')
  async status(
    @Query('vaultUserId') vaultUserId: string,
    @Headers('x-cloudvault-key') key: string,
  ) {
    if (!key || key !== process.env.CLOUDVAULT_API_KEY) {
      throw new BadRequestException('Unauthorized source');
    }
    if (!vaultUserId) throw new BadRequestException('vaultUserId required');
    return this.svc.getStatus(vaultUserId);
  }
}