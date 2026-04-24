import { IsEmail, IsIn } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsIn(['admin', 'vehicle_seller', 'service_seller', 'spare_parts_seller', 'user'])
  role: 'admin' | 'vehicle_seller' | 'service_seller' | 'spare_parts_seller' | 'user';
}
