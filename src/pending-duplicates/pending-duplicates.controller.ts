import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { UpdatePendingDuplicateDto } from './dto/update-pending-duplicate.dto';
import { DuplicateTransactionChoiceDto } from '../transactions/dto/duplicate-transaction-choice.dto';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';

@ApiTags('pending-duplicates')
@ApiBearerAuth()
@Controller('pending-duplicates')
@UseGuards(AuthGuard('jwt'))
export class PendingDuplicatesController {
  constructor(private readonly pendingDuplicatesService: PendingDuplicatesService) {}

  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.pendingDuplicatesService.findPendingDuplicates(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @CurrentUser() user: User) {
    return this.pendingDuplicatesService.findOne(+id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() updatePendingDuplicateDto: UpdatePendingDuplicateDto, @CurrentUser() user: User) {
    return this.pendingDuplicatesService.update(id, updatePendingDuplicateDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a pending duplicate.' })
  remove(@Param('id') id: number, @CurrentUser() user: User) {
    return this.pendingDuplicatesService.delete(id,user.id);
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: number,
    @Body() choiceDto: DuplicateTransactionChoiceDto,
    @CurrentUser() user: User
  ) {
    return this.pendingDuplicatesService.resolvePendingDuplicate(
      +id,
      user.id,
      choiceDto.choice
    );
  }
}
