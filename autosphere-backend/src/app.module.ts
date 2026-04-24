import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { VehicleModule } from './modules/vehicles/vehicle.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServicesModule } from './modules/services/services.module';
import { CardsModule } from './modules/cards/cards.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminModule } from './modules/admin/admin.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
  rootPath: join(process.cwd(), 'public'),
}),


    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST'),
        port: Number(cfg.get('DB_PORT')),
        username: cfg.get('DB_USER'),
        password: cfg.get('DB_PASS'),
        database: cfg.get('DB_NAME'),
        synchronize: true, // dev only
         autoLoadEntities: true,
      }),
    }),

    AuthModule,
    //new
    VehicleModule,
    //
    ServicesModule,
    //
    PaymentsModule,
    //
    AdminModule,
    //
     SubscriptionsModule,
     //
     CardsModule,

  ],
})
export class AppModule {}
