import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity, SubscriptionPlan } from './subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly repo: Repository<SubscriptionEntity>,
  ) {}

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  async upsertOrExtend(args: {
    vaultUserId: string;
    plan: SubscriptionPlan;
    days: number;
    orderId?: string | null;
    vaultEmail?: string | null;
  }) {
    const now = new Date();
    const existing = await this.repo.findOne({ where: { vaultUserId: args.vaultUserId } });

    // If existing active and not expired -> extend from current endsAt
    const base =
      existing && existing.active && existing.endsAt && existing.endsAt.getTime() > now.getTime()
        ? existing.endsAt
        : now;

    const startsAt = existing?.startsAt && base !== now ? existing.startsAt : now;
    const endsAt = this.addDays(base, args.days);

    if (!existing) {
      return this.repo.save(
        this.repo.create({
          vaultUserId: args.vaultUserId,
          plan: args.plan,
          startsAt,
          endsAt,
          active: true,
          lastOrderId: args.orderId || null,
           vaultEmail: args.vaultEmail || null,
        }),
      );
    }

    existing.plan = args.plan;
    existing.startsAt = startsAt;
    existing.endsAt = endsAt;
    existing.active = true;
    existing.lastOrderId = args.orderId || existing.lastOrderId || null;
    existing.vaultEmail = args.vaultEmail || existing.vaultEmail || null;

    return this.repo.save(existing);
  }

  async getStatus(vaultUserId: string) {
    const sub = await this.repo.findOne({ where: { vaultUserId } });
    if (!sub) {
      return { active: false, plan: null, endsAt: null };
    }

    const now = new Date();
    const active = !!sub.active && sub.endsAt.getTime() > now.getTime();

    // Optionally auto-flip active if expired (keeps DB consistent)
    if (!active && sub.active) {
      sub.active = false;
      await this.repo.save(sub);
    }

    return {
      active,
      plan: sub.plan,
      endsAt: sub.endsAt.toISOString().slice(0, 10), // YYYY-MM-DD for UI
    };
  }
}
