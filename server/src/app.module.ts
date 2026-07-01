import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DatabaseModule } from '@/storage/database/database.module';
import { StorageModule } from '@/storage/storage.module';
import { ShoesModule } from '@/shoes/shoes.module';
import { SettingsModule } from '@/settings/settings.module';

@Module({
  imports: [DatabaseModule, StorageModule, ShoesModule, SettingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
