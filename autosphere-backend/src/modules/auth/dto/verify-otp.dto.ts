import { IsEmail, IsIn, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsIn(['admin', 'vehicle_seller', 'service_seller', 'spare_parts_seller', 'user'])
  role: 'admin' | 'vehicle_seller' | 'service_seller' | 'spare_parts_seller' | 'user';

  @IsString()
  @Length(4, 12)
  otp: string;
}
