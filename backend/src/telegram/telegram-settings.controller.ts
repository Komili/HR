import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TelegramSettingsService } from './telegram-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('telegram')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Суперадмин')
export class TelegramSettingsController {
  constructor(private readonly svc: TelegramSettingsService) {}

  @Get('categories')
  getCategories() {
    return this.svc.getCategories();
  }

  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() body: { defaultToken: string }) {
    return this.svc.updateConfig(body?.defaultToken ?? '');
  }

  @Get('chats')
  listChats() {
    return this.svc.listChats();
  }

  @Post('chats')
  createChat(@Body() body: any) {
    return this.svc.createChat(body);
  }

  @Patch('chats/:id')
  updateChat(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateChat(id, body);
  }

  @Delete('chats/:id')
  deleteChat(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteChat(id);
  }

  @Post('chats/:id/test')
  testChat(@Param('id', ParseIntPipe) id: number) {
    return this.svc.testChat(id);
  }
}
