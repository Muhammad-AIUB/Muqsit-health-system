import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// A chat message — at least one of body / attachmentUrl must be present
// (enforced in the service).
export class SendChatDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  // Only http(s) URLs are allowed. Rejecting javascript:/data: schemes here
  // prevents a stored-XSS payload from ever reaching the client render.
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\//i, { message: 'attachmentUrl must be an http(s) URL' })
  attachmentUrl?: string;
}

// Assign a supervising doctor by their registered email or 11-digit mobile.
export class AddSupervisorDto {
  @IsString() @MaxLength(160) identifier!: string;
}
