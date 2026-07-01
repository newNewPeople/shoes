import { Module } from '@nestjs/common';
import { ShoesModule } from '@/shoes/shoes.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [ShoesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
