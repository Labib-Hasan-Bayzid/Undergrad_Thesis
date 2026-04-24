import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  @MaxLength(150)
  recordName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  routingNumber?: string;
}
