import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** No control characters: actor names and notes end up in the audit trail and in SMS. */
const PRINTABLE = /^[^\p{Cc}]*$/u;

export class RefParam {
  @ApiProperty({ example: 'SS-4K2F', description: 'Case reference (case-insensitive).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^SS-[A-HJ-NP-Z2-9]{4}$/, { message: 'ref must look like SS-4K2F' })
  ref: string;
}

export class ActorDto {
  @ApiPropertyOptional({ example: 'Amina W.', maxLength: 80, description: 'Name recorded in the audit trail. Defaults to "console".' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) @Matches(PRINTABLE, { message: 'actor must not contain control characters' })
  actor?: string;
}

export class ResolveDto extends ActorDto {
  @ApiPropertyOptional({ enum: ['RESOLVED', 'FALSE_ALARM'], default: 'RESOLVED' })
  @IsOptional() @IsIn(['RESOLVED', 'FALSE_ALARM'])
  outcome?: 'RESOLVED' | 'FALSE_ALARM';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(PRINTABLE, { message: 'note must not contain control characters' })
  note?: string;
}

export class ListCasesQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;
}
