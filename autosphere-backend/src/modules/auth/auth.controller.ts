import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtGuard } from './guards/jwt.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';


@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ✅ Supports normal users (no files) + sellers (with 2 files)
  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'tradeLicenseFile', maxCount: 1 },
        { name: 'incomeTaxFile', maxCount: 1 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024 } }, // 5MB each
    ),
  )
  register(
    @Body() dto: RegisterDto,
    @UploadedFiles()
    files?: {
      tradeLicenseFile?: Express.Multer.File[];
      incomeTaxFile?: Express.Multer.File[];
    },
  ) {
    const trade = files?.tradeLicenseFile?.[0] ?? null;
    const tax = files?.incomeTaxFile?.[0] ?? null;

    return this.auth.register(dto, { trade, tax });
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  logout(@Req() req: any) {
    return this.auth.logout(req.user.sub);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }


  //
  @Post('forgot-password')
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.auth.forgotPassword(dto.email, dto.role);
}

@Post('verify-otp')
verifyOtp(@Body() dto: VerifyOtpDto) {
  return this.auth.verifyOtp(dto.email, dto.role, dto.otp);
}

@Post('reset-password')
resetPassword(@Body() dto: ResetPasswordDto) {
  return this.auth.resetPassword(dto.resetToken, dto.newPassword);
}
//


 @UseGuards(JwtGuard)
@Patch('me')
updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
  return this.auth.updateMe(req.user.sub, dto);
}

 @UseGuards(JwtGuard)@Post('change-password')
changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
  return this.auth.changePassword(req.user.sub, dto.oldPassword, dto.newPassword);
}
  //
}
