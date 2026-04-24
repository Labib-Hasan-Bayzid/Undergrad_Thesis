// src/modules/auth/dto/update-me.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}


