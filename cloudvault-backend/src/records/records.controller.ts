import {
  Body, Controller, Get, Param, Post, Req, Res, UseGuards, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { CreateRecordDto } from './dto/create-record.dto';
import { RecordsService } from './records.service';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('records')
@UseGuards(AuthGuard('jwt'))
export class RecordsController {
  constructor(private records: RecordsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'deedFiles', maxCount: 20 },
        { name: 'mutationFiles', maxCount: 20 },
        { name: 'taxFiles', maxCount: 20 },
        { name: 'mortgageFiles', maxCount: 20 },
        { name: 'nidFiles', maxCount: 20 },
        { name: 'evidenceFiles', maxCount: 50 },
      ],
      { limits: { fileSize: 15 * 1024 * 1024 } },
    ),
  )
  async create(
    @Body() dto: CreateRecordDto,
    @UploadedFiles()
    files: {
      deedFiles?: Express.Multer.File[];
      mutationFiles?: Express.Multer.File[];
      taxFiles?: Express.Multer.File[];
      mortgageFiles?: Express.Multer.File[];
      nidFiles?: Express.Multer.File[];
      evidenceFiles?: Express.Multer.File[];
    },
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    if (!ownerUserId) throw new Error('User ID missing from JWT');

    const safeFiles = files || {};

    return this.records.create(ownerUserId, dto, {
      DEED: safeFiles.deedFiles ?? [],
      MUTATION: safeFiles.mutationFiles ?? [],
      TAX: safeFiles.taxFiles ?? [],
      MORTGAGE: safeFiles.mortgageFiles ?? [],
      NID: safeFiles.nidFiles ?? [],
      EVIDENCE: safeFiles.evidenceFiles ?? [],
    });
  }

  @Get()
  list(@Req() req: any) {
    const ownerUserId = req.user?.id || req.user?.sub;
    return this.records.list(ownerUserId);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: any) {
    const ownerUserId = req.user?.id || req.user?.sub;
    return this.records.getOne(ownerUserId, id);
  }

  @Post('files/:fileId/request-otp')
  requestFileOtp(
    @Param('fileId') fileId: string,
    @Body() body: { purpose: 'FILE_VIEW' | 'FILE_DOWNLOAD' },
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    const email = req.user?.email;
    return this.records.requestActionOtp(ownerUserId, email, fileId, body.purpose);
  }

  @Post('files/:fileId/verify-otp')
  verifyFileOtp(
    @Param('fileId') fileId: string,
    @Body() body: { purpose: 'FILE_VIEW' | 'FILE_DOWNLOAD'; otp: string },
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    return this.records.verifyActionOtp(ownerUserId, fileId, body.purpose, body.otp);
  }

  @Get('files/:fileId/meta')
  async fileMeta(
    @Param('fileId') fileId: string,
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    const token = String(req.headers['x-action-token'] || '');
    this.records.verifyActionToken(token, ownerUserId, fileId, 'FILE_VIEW');
    return this.records.getFileMeta(ownerUserId, fileId);
  }

  @Get('files/:fileId/download')
async downloadFile(
  @Param('fileId') fileId: string,
  @Req() req: any,
  @Res() res: Response,
) {
  const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
  const token = String(req.headers['x-action-token'] || '');

  this.records.verifyActionToken(token, ownerUserId, fileId, 'FILE_DOWNLOAD');

  const f = await this.records.getFileForDownload(ownerUserId, fileId);
console.log('DOWNLOAD PATH:', f.outputPath, 'EXISTS:', fs.existsSync(f.outputPath));
  return res.download(f.outputPath, f.originalName, () => {
    try {
      if (fs.existsSync(f.outputPath)) {
        fs.unlinkSync(f.outputPath);
      }
    } catch {}
  });
}

  @Post(':recordId/bank/request-otp')
  requestBankOtp(
    @Param('recordId') recordId: string,
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    const email = req.user?.email;
    return this.records.requestActionOtp(ownerUserId, email, recordId, 'BANK_VIEW');
  }

  @Post(':recordId/bank/verify-otp')
  verifyBankOtp(
    @Param('recordId') recordId: string,
    @Body() body: { otp: string },
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    return this.records.verifyActionOtp(ownerUserId, recordId, 'BANK_VIEW', body.otp);
  }

  @Get(':recordId/bank/view')
  async viewBank(
    @Param('recordId') recordId: string,
    @Req() req: any,
  ) {
    const ownerUserId = req.user?.id || req.user?.sub || req.user?.userId;
    const token = String(req.headers['x-action-token'] || '');
    this.records.verifyActionToken(token, ownerUserId, recordId, 'BANK_VIEW');
    return this.records.getBankDetailsForView(ownerUserId, recordId);
  }
}