import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { Folder } from './folder.entity';
import { Document } from './document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Folder, Document])],
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
