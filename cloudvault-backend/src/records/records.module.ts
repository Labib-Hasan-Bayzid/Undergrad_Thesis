import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordEntity } from './entities/record.entity';
import { RecordFile } from './entities/record-file.entity';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { FileAccessOtp } from './entities/file-access-otp.entity';
import { MailService } from 'src/auth/mail.service';
import { JwtModule } from '@nestjs/jwt';
import { PqcBridgeService } from './pqc-bridge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecordEntity, RecordFile, FileAccessOtp]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret_change_me',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [RecordsController],
  providers: [RecordsService, MailService, PqcBridgeService],
})
export class RecordsModule {}