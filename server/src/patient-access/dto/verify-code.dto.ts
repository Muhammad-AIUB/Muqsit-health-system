import { IsString, MaxLength } from 'class-validator';

// The code as the doctor typed it. Only its shape is read in the service
// (`readCode`: six digits, spaces ignored); the cap keeps a pasted page of text
// out of the pipeline.
export class VerifyCodeDto {
  @IsString()
  @MaxLength(32)
  code!: string;
}
