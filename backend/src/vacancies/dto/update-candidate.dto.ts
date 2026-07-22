import { PartialType } from '@nestjs/mapped-types';
import { CandidateDto } from './candidate.dto';

export class UpdateCandidateDto extends PartialType(CandidateDto) {}
