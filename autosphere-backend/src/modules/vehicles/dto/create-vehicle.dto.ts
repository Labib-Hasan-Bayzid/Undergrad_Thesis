import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVehicleDto {
  @IsString()
  title: string;

  @IsIn(['car', 'bike'])
  vehicleType: 'car' | 'bike';

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional()
  @Type(() => Number)
   @IsInt()
  year?: number;

  @IsIn(['new', 'used', 'recondition'])
  condition: 'new' | 'used' | 'recondition';

  @IsInt()
  @Type(() => Number)
   @Min(0)
  price: number;

  @IsString()
  city: string;

  @IsString()
  phone: string;

  @IsString()
  location: string;

  @IsOptional() @IsString()
  description?: string;
}
