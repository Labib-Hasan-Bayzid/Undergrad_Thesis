import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { VaultModule } from './vault/vault.module';
import { OtpModule } from './otp/otp.module';
import { RecordsModule } from './records/records.module';
@Module({
  imports: [
     ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST'),
port: Number(cfg.get<string>('DB_PORT')),
        username: cfg.get<string>('DB_USERNAME'),
        password: cfg.get<string>('DB_PASSWORD'),
        database: cfg.get<string>('DB_DATABASE'),
        
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    
    UsersModule,
    AuthModule,
    
    VaultModule,
    OtpModule,
    RecordsModule,
  ],
})
export class AppModule {}
