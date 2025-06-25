import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ImportLogsService } from './import-logs.service';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('import-logs')
@ApiBearerAuth()
@Controller('import-logs')
@UseGuards(AuthGuard('jwt'))
export class ImportLogsController {
  constructor(private readonly importLogsService: ImportLogsService) {}

  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.importLogsService.findAll(user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    const importLog = await this.importLogsService.findOne(id, user.id);
    if (!importLog) {
      throw new NotFoundException(`Import log with ID ${id} not found`);
    }
    return importLog;
  }
}
