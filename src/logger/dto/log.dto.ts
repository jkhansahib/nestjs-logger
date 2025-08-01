// src/logger/dto/log.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class LogDto {
  @ApiProperty({ example: 'error', description: 'Log level' })
  level: string;

  @ApiProperty({ example: 'An error occurred', description: 'Log message' })
  message: string;
}
