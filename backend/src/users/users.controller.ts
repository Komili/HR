import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe,
  UseGuards, Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('Суперадмин')
  findAll(@Request() req: { user: RequestUser }) {
    return this.usersService.findAll(req.user);
  }

  @Get('roles')
  @Roles('Суперадмин')
  getRoles() {
    return this.usersService.getRoles();
  }

  @Post()
  @Roles('Суперадмин')
  create(
    @Body() body: { email: string; password: string; firstName?: string; lastName?: string; roleId: number; companyId?: number },
    @Request() req: { user: RequestUser },
  ) {
    return this.usersService.createUser(body, req.user);
  }

  @Patch(':id')
  @Roles('Суперадмин')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email?: string; firstName?: string; lastName?: string; roleId?: number; companyId?: number | null; isActive?: boolean },
    @Request() req: { user: RequestUser },
  ) {
    return this.usersService.updateUser(id, body, req.user);
  }

  @Patch(':id/password')
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { newPassword: string },
    @Request() req: { user: RequestUser },
  ) {
    return this.usersService.changePassword(id, body.newPassword, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    await this.usersService.deleteUser(id, req.user);
    return { message: 'Пользователь удалён' };
  }
}
