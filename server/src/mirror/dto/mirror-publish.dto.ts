import { Allow, IsString, MaxLength, MinLength } from 'class-validator';

// POST /mirror/publish body. `payload` is the editor snapshot, opaque to the
// server and fanned out to the same user's other devices. It carries @Allow()
// because ValidationPipe({ whitelist: true }) strips any property with no
// decorator — an undecorated `payload` would arrive as `undefined` on every
// device and mirroring would silently stop.
export class MirrorPublishDto {
  @IsString() @MinLength(1) @MaxLength(64) connId!: string;
  @IsString() @MinLength(1) @MaxLength(64) type!: string;
  @Allow() payload?: unknown;
}
