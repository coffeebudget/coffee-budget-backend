import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Tag } from './entities/tag.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
@UseGuards(AuthGuard('jwt'))
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new tag.' })
  create(@Body() createTagDto: CreateTagDto, @CurrentUser() user: User): Promise<Tag> {
    return this.tagsService.create(createTagDto, user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all tags.' })
  findAll(@CurrentUser() user: User): Promise<Tag[]> {
    return this.tagsService.findAll(user.id);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a tag by ID.' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<Tag> {
    return this.tagsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a tag.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
    @CurrentUser() user: User
  ): Promise<Tag> {
    return this.tagsService.update(id, updateTagDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a tag.' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<void> {
    return this.tagsService.remove(id, user.id);
  }
}