import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  holderName: string;

  @IsString()
  @Matches(/^\d{13,16}$/, { message: 'Card number must be 13 to 16 digits' })
  cardNumber: string;

  @IsString()
  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'Expiry month must be 01-12' })
  expMonth: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Expiry year must be 4 digits' })
  expYear: string;

  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'CVV must be 3 or 4 digits' })
  cvv: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingAddress?: string;
}