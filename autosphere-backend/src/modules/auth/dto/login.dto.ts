import { IsEmail, IsIn, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsIn(['admin', 'vehicle_seller', 'service_seller', 'spare_parts_seller', 'user'])
  role: 'admin' | 'vehicle_seller' | 'service_seller' | 'spare_parts_seller' | 'user';
}
