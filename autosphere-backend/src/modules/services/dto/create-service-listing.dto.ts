import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceListingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsIn(['service', 'part'])
  category: 'service' | 'part';

  @IsIn(['car', 'bike', 'both'])
  vehicleSupport: 'car' | 'bike' | 'both';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsString()
  description?: string;

  // service fields
  @IsOptional()
  @IsIn(['maintenance', 'repair', 'diagnostics', 'detailing'])
  serviceType?: 'maintenance' | 'repair' | 'diagnostics' | 'detailing';

  // part fields
  @IsOptional()
  @IsIn(['engine', 'brakes', 'suspension', 'electrical', 'body'])
  partCategory?: 'engine' | 'brakes' | 'suspension' | 'electrical' | 'body';

  @IsOptional()
  @IsIn(['new', 'used', 'refurbished'])
  partCondition?: 'new' | 'used' | 'refurbished';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;
}
