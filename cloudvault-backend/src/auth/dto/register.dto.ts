import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  fullName: string;

  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  // BD phone style example: 01XXXXXXXXX (you can relax this if needed)
  @Matches(/^01\d{9}$/, { message: 'phone must be like 01XXXXXXXXX' })
  phone: string;

  @IsEmail()
 // @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(8)
  confirmPassword: string;
}
