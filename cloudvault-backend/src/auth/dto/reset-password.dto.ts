import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;
@IsString()
  @MinLength(8)
  newPassword: string;
  
}
