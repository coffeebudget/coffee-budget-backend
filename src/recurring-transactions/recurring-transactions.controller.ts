import { RecurringTransactionsService } from './recurring-transactions.service';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User as UserEntity } from '../users/user.entity';
import { CurrentUser as User } from '../auth/user.decorator';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';

/**
 * Controller for recurring transactions - simplified for analytics only
 */
@ApiTags('recurring-transactions')
@Controller('recurring-transactions')
@UseGuards(AuthGuard('jwt'))
export class RecurringTransactionsController {
  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new recurring transaction' })
  create(
    @Body() createDto: CreateRecurringTransactionDto,
    @User() user: UserEntity,
  ) {
    return this.recurringTransactionsService.create(createDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all recurring transactions for the user' })
  findAll(@User() user: UserEntity) {
    return this.recurringTransactionsService.findAll(user.id);
  }

  @Get('unconfirmed-patterns')
  @ApiOperation({ summary: 'Get unconfirmed recurring patterns' })
  getUnconfirmedPatterns(@User() user: UserEntity) {
    return this.recurringTransactionsService.getUnconfirmedPatterns(user.id);
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Detect recurring patterns from user transactions' })
  detectPatterns(@User() user: UserEntity) {
    return this.recurringTransactionsService.detectAllPatterns(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recurring transaction by ID' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  findOne(@Param('id') id: string, @User() user: UserEntity) {
    return this.recurringTransactionsService.findOne(+id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a recurring transaction by ID' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateRecurringTransactionDto,
    @User() user: UserEntity,
  ) {
    return this.recurringTransactionsService.update(+id, updateDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a recurring transaction by ID' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  remove(@Param('id') id: string, @User() user: UserEntity) {
    return this.recurringTransactionsService.remove(+id, user.id);
  }
}
