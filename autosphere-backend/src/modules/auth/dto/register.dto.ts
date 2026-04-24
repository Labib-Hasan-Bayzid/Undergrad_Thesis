import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  city: string;

  @IsString()
  @MinLength(6)
  password: string;

  // ✅ admin NOT allowed from public register
  @IsIn(['vehicle_seller', 'service_seller', 'spare_parts_seller', 'user'])
  role: 'vehicle_seller' | 'service_seller' | 'spare_parts_seller' | 'user';

  // Seller extra fields (required only if seller)
  @IsOptional() @IsString() sellerLocation?: string;
  @IsOptional() @IsString() sellerContact?: string;
  @IsOptional() @IsString() sellerTin?: string;
}
