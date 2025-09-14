// src/logger/dto/create-log.dto.ts
import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateLogDto {
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  context?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  ip?: string;

  @IsIn(['debug', 'info', 'warn', 'error', 'verbose'])
  @IsOptional()
  level?: string;
}
