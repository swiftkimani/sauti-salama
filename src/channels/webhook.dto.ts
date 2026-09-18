import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Africa's Talking callback bodies. Deliberately permissive about format (a survivor's call must never be refused
 * over a field we do not use) but typed and bounded. Unknown fields are stripped by the global ValidationPipe.
 */
export class UssdCallbackDto {
  @ApiProperty() @IsString() @MaxLength(100) sessionId: string;
  @ApiProperty({ example: '+254712345678' }) @IsString() @MaxLength(32) phoneNumber: string;
  @ApiPropertyOptional({ example: '*384*7262#' }) @IsOptional() @IsString() @MaxLength(32) serviceCode?: string;
  @ApiPropertyOptional({ example: '2*1*2', description: 'Everything the user entered this session, joined by *' }) @IsOptional() @IsString() @MaxLength(300) text?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) networkCode?: string;
}

export class SmsInboundDto {
  @ApiProperty({ example: '+254712345678' }) @IsString() @MaxLength(32) from: string;
  @ApiPropertyOptional({ example: '7262' }) @IsOptional() @IsString() @MaxLength(32) to?: string;
  @ApiProperty({ description: 'Message text (long messages arrive concatenated)' }) @IsString() @MaxLength(2000) text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) linkId?: string;
}

export class SmsDeliveryDto {
  @ApiProperty() @IsString() @MaxLength(100) id: string;
  @ApiPropertyOptional({ example: 'Success' }) @IsOptional() @IsString() @MaxLength(64) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phoneNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) failureReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) networkCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8) retryCount?: string;
}

export class VoiceCallbackDto {
  @ApiProperty() @IsString() @MaxLength(100) sessionId: string;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @IsString() @MaxLength(4) isActive?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) direction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) callerNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) destinationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) dtmfDigits?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) recordingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) durationInSeconds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) callSessionState?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) hangupCause?: string;
  @ApiPropertyOptional({ description: 'Simulator only (ignored in production): the text to use instead of transcribing' })
  @IsOptional() @IsString() @MaxLength(6000) mockTranscript?: string;
}
