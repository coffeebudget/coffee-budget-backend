import { Controller, Get, Query, UseGuards, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { FreeToSpendService } from './free-to-spend.service';
import { FreeToSpendResponseDto } from './dto/free-to-spend.dto';

@ApiTags('Free to Spend')
@ApiBearerAuth()
@Controller('free-to-spend')
@UseGuards(AuthGuard('jwt'))
export class FreeToSpendController {
  constructor(private readonly freeToSpendService: FreeToSpendService) {}

  @Get()
  @ApiOperation({
    summary: 'Get free to spend calculation',
    description:
      'Calculate the amount of money that can be spent guilt-free after ' +
      'all obligations are covered. Formula: Income - Obligations - Already Spent (discretionary)',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    description:
      'Month to calculate for in YYYY-MM format (defaults to current month)',
    example: '2026-01',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Free to spend calculation retrieved successfully',
    type: FreeToSpendResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async calculate(
    @CurrentUser() user: any,
    @Query('month') month?: string,
  ): Promise<FreeToSpendResponseDto> {
    // Default to current month if not specified
    const targetMonth = month ?? new Date().toISOString().slice(0, 7); // YYYY-MM format

    return this.freeToSpendService.calculate(user.id, targetMonth);
  }
}
