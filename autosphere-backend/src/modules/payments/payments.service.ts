import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { In, Repository } from 'typeorm';
import { PaymentOrderEntity } from './payment-order.entity';
import { ServiceListingEntity } from '../services/services.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WorkshopBookingsService } from '../workshop-bookings/workshop-bookings.service';
type CheckoutItem = { kind: 'service' | 'part'; id: string; qty: number };
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(
    @InjectRepository(PaymentOrderEntity) private readonly orders: Repository<PaymentOrderEntity>,
    @InjectRepository(ServiceListingEntity) private readonly services: Repository<ServiceListingEntity>,
      @InjectRepository(VehicleEntity) private readonly vehicles: Repository<VehicleEntity>,
private readonly subs: SubscriptionsService,
private readonly bookingsSvc: WorkshopBookingsService,
 private readonly jwt: JwtService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }

  generateUserToken(userId: string) {
  return this.jwt.sign({ sub: userId });
}
  // ---------- Shared: build DB-trusted lines ----------
  private async buildDbLines(items: { kind: string; id: string; qty: number }[]) {
  const clean = (items || []).filter((x) => x?.id && Number(x.qty) > 0);
  if (!clean.length) throw new BadRequestException('No items');

  const svcIds = clean.filter(i => i.kind === 'service' || i.kind === 'part').map(i => i.id);
  const vehIds = clean.filter(i => i.kind === 'vehicle').map(i => i.id);

  const svcRows = svcIds.length
    ? await this.services.find({ where: { id: In(svcIds) } })
    : [];
  const vehRows = vehIds.length
    ? await this.vehicles.find({ where: { id: In(vehIds) } })
    : [];

  // Verify all requested IDs exist in their correct tables
  if (svcRows.length !== svcIds.length || vehRows.length !== vehIds.length) {
    throw new BadRequestException('Some items not found');
  }

  const dbLines = clean.map((it) => {
    if (it.kind === 'vehicle') {
      const v = vehRows.find(x => x.id === it.id)!;
      if (v.status !== 'available') throw new BadRequestException('Item not available');

      return {
        ...it,
        kind: 'vehicle',
        id: v.id,
        qty: Number(it.qty),
        title: v.title,
        unitPrice: Number(v.price), // DB taka int
        sellerId: v.sellerId,
      };
    }

    // service/part
    const s = svcRows.find(x => x.id === it.id)!;
    if (s.status !== 'available') throw new BadRequestException('Item not available');

    return {
      ...it,
      kind: s.category, // 'service' | 'part'
      id: s.id,
      qty: Number(it.qty),
      title: s.title,
      unitPrice: Number(s.price), // DB taka int
      sellerId: s.sellerId,
    };
  });

  const amount = dbLines.reduce((sum, x) => sum + x.unitPrice * x.qty, 0);
  return { dbLines, amount };
}


  // ---------- STRIPE ----------
  async createStripeCheckout(body: { items: CheckoutItem[]; source?: string}, buyerId: string ) {
    const { dbLines, amount } = await this.buildDbLines(body.items);

    const order = await this.orders.save(
      this.orders.create({
        
        provider: 'stripe',
        source: body.source || 'workshops',
        buyerId,
        amount, // taka
        currency: 'bdt',
        status: 'pending',
        items: dbLines,
        stripeSessionId: null,
        stripePaymentIntentId: null,
        sslczTranId: null,
        sslczValId: null,
        
      }),
    );

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5001';
    const successUrl = `${FRONTEND_URL}/payment_success.html?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${FRONTEND_URL}/payment_cancel.html?orderId=${order.id}`;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: dbLines.map((x) => ({
        quantity: x.qty,
        price_data: {
          currency: 'bdt',
          // ✅ DB taka → Stripe minor unit (paisa)
          unit_amount: x.unitPrice * 100,
          product_data: { name: x.title },
        },
      })),
      metadata: { orderId: order.id },
    });

    await this.orders.update({ id: order.id }, { stripeSessionId: session.id });
    return { url: session.url, orderId: order.id };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | string[] | undefined) {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) throw new BadRequestException('Missing Stripe-Signature header');

    const whsec = process.env.STRIPE_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, whsec);
    } catch (e: any) {
      throw new BadRequestException(`Webhook signature verify failed: ${e.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = (session.metadata?.orderId || null) as string | null;
      if (orderId) {
        await this.orders.update(
          { id: orderId },
          {
            status: 'paid',
            stripePaymentIntentId: (session.payment_intent as string) || null,
          },
        );
      }
    }

    return { received: true };
  }

  // ---------- SSLCOMMERZ (MFS) ----------
  private sslBase() {
    return process.env.SSLCZ_IS_LIVE === 'true'
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';
  }

  async createSslczCheckout(body: { items: CheckoutItem[]; source?: string},buyerId: string ) {
    const { dbLines, amount } = await this.buildDbLines(body.items);

    const storeId = process.env.SSLCZ_STORE_ID!;
    const storePass = process.env.SSLCZ_STORE_PASS!;
    if (!storeId || !storePass) throw new BadRequestException('SSLCOMMERZ store credentials missing');

    // create order first (pending)
    const tranId = `AS-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const order = await this.orders.save(
      this.orders.create({
        provider: 'sslcz',
        source: body.source || 'workshops',
        buyerId,
        amount, // taka
        currency: 'bdt',
        status: 'pending',
        items: dbLines,
        stripeSessionId: null,
        stripePaymentIntentId: null,
        sslczTranId: tranId,
        sslczValId: null,
      }),
    );

    // Callback URLs MUST be public (ngrok)
    const successUrl = process.env.SSLCZ_SUCCESS_URL!;
    const failUrl = process.env.SSLCZ_FAIL_URL!;
    const cancelUrl = process.env.SSLCZ_CANCEL_URL!;
    const ipnUrl = process.env.SSLCZ_IPN_URL!;

    const payload = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePass,
      total_amount: String(amount),
      currency: 'BDT',
      tran_id: tranId,

      success_url: successUrl,
      fail_url: failUrl,
      cancel_url: cancelUrl,
      ipn_url: ipnUrl,

      shipping_method: 'NO',
      product_name: 'AutoSphere Order',
      product_category: 'Service',
      product_profile: 'general',

      cus_name: 'Customer',
      cus_email: 'customer@autosphere.local',
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
    });

    const res = await fetch(`${this.sslBase()}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });

    const data: any = await res.json().catch(async () => ({ raw: await res.text() }));
    if (!res.ok) throw new BadRequestException(data?.failedreason || 'SSLCOMMERZ init failed');

    if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
      throw new BadRequestException(data?.failedreason || 'SSLCOMMERZ did not return GatewayPageURL');
    }

    return { url: data.GatewayPageURL, orderId: order.id, tranId };
  }

  private async sslczValidate(valId: string) {
    const storeId = process.env.SSLCZ_STORE_ID!;
    const storePass = process.env.SSLCZ_STORE_PASS!;

    const qs = new URLSearchParams({
      val_id: valId,
      store_id: storeId,
      store_passwd: storePass,
      v: '1',
      format: 'json',
    });

    const res = await fetch(`${this.sslBase()}/validator/api/validationserverAPI.php?${qs.toString()}`);
    const data: any = await res.json().catch(async () => ({ raw: await res.text() }));
    if (!res.ok) throw new BadRequestException('SSLCOMMERZ validation failed');
    return data;
  }

  async handleSslczSuccess(payload: any) {
    const tranId = payload?.tran_id;
    const valId = payload?.val_id;

    if (!tranId || !valId) throw new BadRequestException('Missing tran_id/val_id');

    const validation = await this.sslczValidate(valId);
    const status = (validation?.status || '').toUpperCase();

    if (status === 'VALID' || status === 'VALIDATED') {
      await this.orders.update(
        { sslczTranId: tranId },
        { status: 'paid', sslczValId: valId },
      );
//



      // ✅ NEW: if autovault subscription, upsert/extend
      
    const order = await this.orders.findOne({ where: { sslczTranId: tranId } });
const first = Array.isArray(order?.items) ? order.items[0] : null;

const bookingId = first?.bookingId;
if (bookingId && order?.id) {
  await this.bookingsSvc.markPaid(bookingId, order.id);
}


    if (order?.source === 'autovault') {
      const firstitem = Array.isArray(order.items) ? order.items[0] : null;
      const vaultUserId = first?.vaultUserId;
      const planId = (first?.id || '').toLowerCase();
      const days = Number(first?.days || 30);

      if (vaultUserId && (planId === 'standard' || planId === 'premium')) {
        await this.subs.upsertOrExtend({
          vaultUserId,
          plan: planId,
          days,
          orderId: order.id,
        });
      }
    }
      return { ok: true };
    }

    await this.orders.update(
      { sslczTranId: tranId },
      { status: 'failed', sslczValId: valId },
    );
    return { ok: false, status };
  }

  async handleSslczFail(payload: any) {
    const tranId = payload?.tran_id;
    if (tranId) await this.orders.update({ sslczTranId: tranId }, { status: 'failed' });
    return { ok: true };
  }

  async handleSslczCancel(payload: any) {
    const tranId = payload?.tran_id;
    if (tranId) await this.orders.update({ sslczTranId: tranId }, { status: 'canceled' });
    return { ok: true };
  }

  async handleSslczIpn(payload: any) {
    // IPN is server-to-server: validate and mark paid
    const tranId = payload?.tran_id;
    const valId = payload?.val_id;
    if (!tranId || !valId) return { ok: false };

    const validation = await this.sslczValidate(valId);
    const status = (validation?.status || '').toUpperCase();

    if (status === 'VALID' || status === 'VALIDATED') {
      await this.orders.update({ sslczTranId: tranId }, { status: 'paid', sslczValId: valId });

      //
      const order = await this.orders.findOne({ where: { sslczTranId: tranId } });
const first = Array.isArray(order?.items) ? order.items[0] : null;

const bookingId = first?.bookingId;
if (bookingId && order?.id) {
  await this.bookingsSvc.markPaid(bookingId, order.id);
}
      // ✅ NEW: if autovault subscription, upsert/extend
    if (order?.source === 'autovault') {
      const firstitem = Array.isArray(order.items) ? order.items[0] : null;
      const vaultUserId = first?.vaultUserId;
      const planId = (first?.id || '').toLowerCase();
      const days = Number(first?.days || 30);
      //
const vaultEmail = first?.vaultEmail || null;

await this.subs.upsertOrExtend({
  vaultUserId,
  plan: planId,
  days,
  orderId: order.id,
  vaultEmail,
});
      //

      if (vaultUserId && (planId === 'standard' || planId === 'premium')) {
        await this.subs.upsertOrExtend({
          vaultUserId,
          plan: planId,
          days,
          orderId: order.id,
        });
      }
    }
      return { ok: true };
    }

    return { ok: false, status };
  }
//
async listMyOrders(userId: string) {
  if (!userId) return [];

  const rows = await this.orders.find({
    where: { buyerId: userId },
    order: { createdAt: 'DESC' },
  });

  // normalize for UI
  return rows.map((o: any) => {
    const first = Array.isArray(o.items) && o.items.length ? o.items[0] : null;

    return {
      id: o.id,
      type: first?.kind || 'other',            // vehicle | service | part
      item: first?.title || 'Purchase',
      seller: first?.sellerId || '-',          // later you can join seller name
      status: o.status || 'pending',           // paid/pending/failed/canceled
      method: o.provider === 'stripe' ? 'card' : 'bkash',
      amount: Number(o.amount || 0),
      receipt: o.sslczTranId || o.stripeSessionId || '-',
      date: new Date(o.createdAt).getTime(),
      notes: o.source ? `Source: ${o.source}` : '',
    };
  });
}
//new
async createAutovaultSubscriptionSslczCheckout(body: { planId: 'standard' | 'premium'; vaultUserId: string; vaultEmail: string }) {
  const planId = (body.planId || '').toLowerCase();
  const vaultUserId = body.vaultUserId;

  // ✅ add this line (fixes TS error)
  const vaultEmail = (body.vaultEmail || '').trim() || null;

  const plans: Record<string, { title: string; price: number; days: number }> = {
    standard: { title: 'AutoVault Standard', price: 299, days: 30 },
    premium: { title: 'AutoVault Premium', price: 499, days: 30 },
  };

  const plan = plans[planId];
  if (!plan) throw new BadRequestException('Invalid plan');

  const storeId = process.env.SSLCZ_STORE_ID!;
  const storePass = process.env.SSLCZ_STORE_PASS!;
  if (!storeId || !storePass) throw new BadRequestException('SSLCOMMERZ store credentials missing');

  const tranId = `AV-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  // Save order in payment_orders (you already have this table)
  const order = await this.orders.save(
    this.orders.create({
      provider: 'sslcz',
      source: 'autovault',
      buyerId: null, // AutoSphere user not known
      amount: plan.price,
      currency: 'bdt',
      status: 'pending',
      items: [
        {
          kind: 'subscription',
          id: planId,
          qty: 1,
          title: plan.title,
          unitPrice: plan.price,
          vaultUserId, // 👈 store vault user id inside items for now
 vaultEmail, // ✅ now valid (declared above)          days: plan.days,
        },
      ],
      sslczTranId: tranId,
      sslczValId: null,
      stripeSessionId: null,
      stripePaymentIntentId: null,
    }),
  );

  const successUrl = process.env.SSLCZ_SUCCESS_URL!;
  const failUrl = process.env.SSLCZ_FAIL_URL!;
  const cancelUrl = process.env.SSLCZ_CANCEL_URL!;
  const ipnUrl = process.env.SSLCZ_IPN_URL!;

  const payload = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePass,
    total_amount: String(plan.price),
    currency: 'BDT',
    tran_id: tranId,

    success_url: successUrl,
    fail_url: failUrl,
    cancel_url: cancelUrl,
    ipn_url: ipnUrl,

    shipping_method: 'NO',
    product_name: plan.title,
    product_category: 'Subscription',
    product_profile: 'general',

    cus_name: 'Customer',
    cus_email: 'customer@autovault.local',
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: '01700000000',
  });

  const res = await fetch(`${this.sslBase()}/gwprocess/v4/api.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  const data: any = await res.json().catch(async () => ({ raw: await res.text() }));
  if (!res.ok) throw new BadRequestException(data?.failedreason || 'SSLCOMMERZ init failed');
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
    throw new BadRequestException(data?.failedreason || 'SSLCOMMERZ did not return GatewayPageURL');
  }

  return { url: data.GatewayPageURL, orderId: order.id, tranId };
}

//
async findByTranId(tranId: string) {
  if (!tranId) return null;

  return this.orders.findOne({
    where: { sslczTranId: tranId },
  });
}

//
// ✅ Seller payments for Vehicle seller dashboard
async listSellerVehiclePayments(sellerId: string, limit = 50) {
  const take = Math.max(1, Math.min(200, Number(limit) || 50));

  // ✅ JSONB array contains an object with sellerId + kind=vehicle
  const orders = await this.orders
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere('po.items @> :match', {
      match: JSON.stringify([{ sellerId, kind: 'vehicle' }]),
    })
    .orderBy('po.createdAt', 'DESC')
    .take(take)
    .getMany();

  const rows: any[] = [];

  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      if ((it?.kind || '').toLowerCase() !== 'vehicle') continue;
      if (String(it?.sellerId || '') !== String(sellerId)) continue;

      const itemTotal = Number(it.unitPrice || 0) * Number(it.qty || 1);

      rows.push({
        vehicle: it.title || it.id || '—',
        amount: itemTotal || Number(o.amount || 0),
        method: o.provider === 'stripe' ? 'card' : 'bkash',
        reference: o.id,
        receipt: o.sslczTranId || o.stripeSessionId || '—',
        date: o.createdAt,
      });
    }
  }

  return rows.slice(0, take);
}

//
async listSellerServicePayments(sellerId: string, limit = 50) {
  const take = Math.max(1, Math.min(200, Number(limit) || 50));

  const orders = await this.orders
    .createQueryBuilder('po')
    .where('po.status = :st', { st: 'paid' })
    .andWhere(
      `(po.items @> :svcMatch OR po.items @> :partMatch)`,
      {
        svcMatch: JSON.stringify([{ sellerId, kind: 'service' }]),
        partMatch: JSON.stringify([{ sellerId, kind: 'part' }]),
      },
    )
    .orderBy('po.createdAt', 'DESC')
    .take(take)
    .getMany();

  const rows: any[] = [];

  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const k = String(it?.kind || '').toLowerCase();
      if (k !== 'service' && k !== 'part') continue;
      if (String(it?.sellerId || '') !== String(sellerId)) continue;

      const itemTotal = Number(it.unitPrice || 0) * Number(it.qty || 1);

      rows.push({
        item: it.title || it.id || '—',
        kind: k, // service | part (optional for UI)
        amount: itemTotal || Number(o.amount || 0),
        method: o.provider === 'stripe' ? 'card' : 'bkash',
        reference: o.id,
        receipt: o.sslczTranId || o.stripeSessionId || '—',
        date: o.createdAt,
      });
    }
  }

  return rows.slice(0, take);
}


}
