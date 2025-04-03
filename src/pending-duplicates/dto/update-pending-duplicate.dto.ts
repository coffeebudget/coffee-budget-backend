import { PartialType } from '@nestjs/swagger';
import { CreatePendingDuplicateDto } from './create-pending-duplicate.dto';

export class UpdatePendingDuplicateDto extends PartialType(CreatePendingDuplicateDto) {}
