import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { SettingsService, UpdateAiSettingsInput } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('ai')
  @HttpCode(200)
  getAiSettings() {
    const data = this.settingsService.getAiSettings();
    return { code: 200, msg: 'success', data };
  }

  @Put('ai')
  @HttpCode(200)
  updateAiSettings(@Body() body: UpdateAiSettingsInput) {
    const data = this.settingsService.updateAiSettings(body);
    return { code: 200, msg: 'AI 配置已保存并生效', data };
  }

  @Post('ai/test')
  @HttpCode(200)
  async testAiConnection() {
    const result = await this.settingsService.testAiConnection();
    return {
      code: result.ok ? 200 : 400,
      msg: result.message,
      data: result,
    };
  }
}
