import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { CreditCardsService } from './credit-cards.service';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { CreditCard } from './entities/credit-card.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';

@ApiTags('credit-cards')
@ApiBearerAuth()
@Controller('credit-cards')
@UseGuards(AuthGuard('jwt'))
export class CreditCardsController {
  constructor(private readonly creditCardsService: CreditCardsService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new credit card.' })
  create(@Body() createCreditCardDto: CreateCreditCardDto, @CurrentUser() user: User): Promise<CreditCard> {
    return this.creditCardsService.create(createCreditCardDto, user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all credit cards.' })
  findAll(@CurrentUser() user: User): Promise<CreditCard[]> {
    return this.creditCardsService.findAll(user.id);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a credit card by ID.' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<CreditCard> {
    return this.creditCardsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a credit card.' })
  update(
    @Param('id', ParseIntPipe) id: number, 
    @Body() updateCreditCardDto: UpdateCreditCardDto,
    @CurrentUser() user: User
  ): Promise<CreditCard> {
    return this.creditCardsService.update(id, updateCreditCardDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a credit card.' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<void> {
    return this.creditCardsService.remove(id, user.id);
  }
}
