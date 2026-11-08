import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { ActiveWorkstation, WorkstationDoctorId } from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { MulterErrorFilter } from '../uploads/multer-error.filter';
import { UploadService } from '../uploads/upload.service';
import { Actor, PatientFilesService } from './patient-files.service';
import { UploadPatientFileDto } from './dto/patient-file.dto';

// ⚕️ The assistant's key: the same one the patient's own image galleries need
// (`PATCH /patients/:id` with prescriptionImages / reportImages).
const WRITE_KEY = 'pt.info';
// One DICOM file. A CT or MRI series is many files; a single one above this is
// refused with 413 rather than filling the disk.
export const DICOM_MAX_BYTES = 300 * 1024 * 1024;

const actorOf = (user: AuthenticatedUser): Actor => ({
  userId: user.id,
  name: user.displayName?.trim() || user.name || 'Someone',
});

// ⚕️ Imaging DICOM is a PREMIUM feature (physician, 09/11/2026): the signed-in
// user's tier decides, on the server too — a blurred screen alone is not a gate.
const assertPremium = (user: AuthenticatedUser): void => {
  if (user.accountTier !== 'premium') {
    throw new ForbiddenException('Imaging DICOM is available to premium accounts');
  }
};

const assertMayWrite = (ws: Workstation): void => {
  if (ws.role === 'assistant' && !ws.permissions.includes(WRITE_KEY)) {
    throw new ForbiddenException('You do not have permission to add or remove patient files');
  }
};

/**
 * Permissions (scanned images) and Imaging DICOM files of a patient — see
 * PatientFilesService for who may do what.
 */
@Controller('patients/:id/files')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientFilesController {
  constructor(
    private readonly svc: PatientFilesService,
    private readonly uploads: UploadService,
  ) {}

  @Get(':kind')
  list(
    @WorkstationDoctorId() doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('kind', new ParseEnumPipe(['permission', 'dicom'])) kind: 'permission' | 'dicom',
  ) {
    if (kind === 'dicom') assertPremium(user);
    return this.svc.list(doctorId, id, kind);
  }

  // A scanned permission: an image, checked by its bytes like every other upload.
  @Post('permission')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, fields: 2 } }))
  async addPermission(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPatientFileDto,
  ) {
    assertMayWrite(ws);
    if (!file) throw new BadRequestException('No file uploaded');
    // The owner check is inside `add`, after the image is stored — an image
    // stored for a refused request is an unreferenced file, which is harmless;
    // check first anyway so a refused request leaves nothing on disk.
    await this.svc.assertMayWriteFiles(doctorId, id);
    const url = await this.uploads.uploadImage(file);
    return this.svc.add(doctorId, actorOf(user), id, 'permission', { ...dto, url, size: file.size, originalName: file.originalname });
  }

  // A DICOM file: streamed to disk (it can be large), then checked for `DICM`.
  @Post('dicom')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, join(process.cwd(), 'uploads')),
        filename: (_req, _file, cb) => cb(null, `tmp-${randomUUID()}`),
      }),
      limits: { fileSize: DICOM_MAX_BYTES, fields: 2 },
    }),
  )
  async addDicom(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPatientFileDto,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    try {
      assertPremium(user);
      assertMayWrite(ws);
      // Name and the owner check come before the file is kept, so a refused
      // request leaves nothing on disk.
      if (!dto.name?.trim()) throw new BadRequestException('Give the DICOM file a name.');
      await this.svc.assertMayWriteFiles(doctorId, id);
      const url = this.uploads.storeDicomFromDisk(file.path);
      return await this.svc.add(doctorId, actorOf(user), id, 'dicom', { ...dto, url, size: file.size, originalName: file.originalname });
    } finally {
      try { unlinkSync(file.path); } catch { /* moved or already gone */ }
    }
  }

  // A SOFT removal — the row and the file are kept.
  @Delete(':fileId')
  remove(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    assertMayWrite(ws);
    return this.svc.remove(doctorId, actorOf(user), id, fileId, user.accountTier === 'premium');
  }
}
