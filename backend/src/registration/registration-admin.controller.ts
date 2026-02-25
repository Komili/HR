import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('registration/tokens')
export class RegistrationAdminController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  async createToken(
    @Body('companyId') companyId: number,
    @Request() req: { user: RequestUser },
  ) {
    const targetCompanyId = req.user.isHoldingAdmin ? companyId : req.user.companyId;
    if (!targetCompanyId) {
      throw new BadRequestException('Company ID is required');
    }
    return this.registrationService.createToken(targetCompanyId, req.user);
  }

  @Get()
  @Roles('Суперадмин', 'Кадровик')
  async getTokens(
    @Query('companyId') companyId: string,
    @Request() req: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.registrationService.getTokens(req.user, requestedCompanyId);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  async revokeToken(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.registrationService.revokeToken(id, req.user);
  }
}
