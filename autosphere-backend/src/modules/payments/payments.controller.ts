import {
  All,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard'; // adjust path if yours differs
import { PaymentsService } from './payments.service';

import { BadRequestException } from '@nestjs/common';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @UseGuards(JwtGuard)
  @Post('stripe/checkout')
  createStripe(@Req() req: any, @Body() body: any) {
    return this.svc.createStripeCheckout(body, req.user.sub);
  }
  @Post('stripe/webhook')
  async webhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') sig: string,
  ) {
    const result = await this.svc.handleStripeWebhook(req.body, sig);
    return res.json(result);
  }
  @UseGuards(JwtGuard)
  @Post('mfs/sslcz/init')
  createSslcz(@Req() req: any, @Body() body: any) {
    return this.svc.createSslczCheckout(body, req.user.sub);
  }
  @All('mfs/sslcz/success')
  async success(@Req() req: Request, @Res() res: Response) {
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    // validate + mark order paid
    await this.svc.handleSslczSuccess(payload);

    const tranId = payload?.tran_id;

    // find order by tranId
    const order = await this.svc.findByTranId(tranId);

    if (!order) {
      return res.redirect(process.env.FRONTEND_URL + '/');
    }

    // 👇 If this payment came from CloudVault
    if (order.source === 'autovault') {
      // redirect to CloudVault dashboard
      return res.redirect('http://localhost:5000/dashboard.html?sub=1');
    }

    // otherwise normal AutoSphere flow
    //const url = `${process.env.FRONTEND_URL}/user_buying_history.html?paid=1`;
    //return res.redirect(url);
    return res.redirect(
      'http://localhost:5001/user_buying_history.html?paid=1',
    );
  }

  @All('mfs/sslcz/fail')
  async fail(@Req() req: Request, @Res() res: Response) {
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    await this.svc.handleSslczFail(payload);

    const tranId = payload?.tran_id;
    const order = await this.svc.findByTranId(tranId);

    if (order?.source === 'autovault') {
      return res.redirect('http://localhost:5000/dashboard.html?sub=0');
    }

    //const url = `${process.env.FRONTEND_URL}/user_buying_history.html?paid=0`;
    //return res.redirect(url);
    return res.redirect(
      'http://localhost:5001/user_buying_history.html?paid=1',
    );
  }

  @All('mfs/sslcz/cancel')
  async cancel(@Req() req: Request, @Res() res: Response) {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    await this.svc.handleSslczCancel(payload);

    //const url = `${process.env.FRONTEND_URL}/user_buying_history.html?paid=1`;
    //return res.redirect(url);
    return res.redirect(
      'http://localhost:5001/user_buying_history.html?paid=1',
    );
  }

  @All('mfs/sslcz/ipn')
  async ipn(@Req() req: Request, @Res() res: Response) {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const out = await this.svc.handleSslczIpn(payload);
    return res.json(out);
  }

  //
  @UseGuards(JwtGuard)
  @Get('my')
  myOrders(@Req() req: any) {
    const userId = req.user?.sub; // from JwtStrategy validate()
    return this.svc.listMyOrders(userId);
  }

  //new

  @Post('mfs/sslcz/init-autovault')
  createSslczAutovault(
    @Headers('x-cloudvault-key') key: string,
    @Body() body: any,
  ) {
    if (!key || key !== process.env.CLOUDVAULT_API_KEY) {
      throw new BadRequestException('Unauthorized source');
    }

    // body must include vaultUserId
    if (!body?.vaultUserId)
      throw new BadRequestException('vaultUserId required');

    return this.svc.createAutovaultSubscriptionSslczCheckout(body);
  }
  // ✅ Vehicle seller dashboard payments table
  @UseGuards(JwtGuard)
  @Get('seller/vehicle')
  sellerVehiclePayments(@Req() req: any, @Query('limit') limit = '50') {
    return this.svc.listSellerVehiclePayments(
      req.user.sub,
      Number(limit) || 50,
    );
  }

  //
  @UseGuards(JwtGuard)
  @Get('seller/services')
  sellerServicePayments(@Req() req: any, @Query('limit') limit = '50') {
    return this.svc.listSellerServicePayments(
      req.user.sub,
      Number(limit) || 50,
    );
  }
}
