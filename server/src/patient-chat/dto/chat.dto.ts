import { IsOptional, IsString, MaxLength } from 'class-validator';

// A chat message — at least one of body / attachmentUrl must be present
// (enforced in the service).
export class SendChatDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
}

// Assign a supervising doctor by their registered email or 11-digit mobile.
export class AddSupervisorDto {
  @IsString() @MaxLength(160) identifier!: string;
}
