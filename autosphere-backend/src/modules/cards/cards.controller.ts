import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('cards')
@UseGuards(JwtGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateCardDto) {
    return this.cardsService.create(req.user.sub, dto);
  }

  @Get()
  listMine(@Req() req: any) {
    return this.cardsService.listMine(req.user.sub);
  }

  @Get(':id/view')
  async view(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const out = await this.cardsService.prepareView(req.user.sub, id);

    res.download(out.filePath, out.downloadName, () => {
      try {
        if (fs.existsSync(out.filePath)) {
          fs.unlinkSync(out.filePath);
        }
      } catch {}
    });
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.cardsService.remove(req.user.sub, id);
  }
}