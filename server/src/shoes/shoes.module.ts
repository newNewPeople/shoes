import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ShoesController } from './shoes.controller';
import { ShoesService } from './shoes.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  ],
  controllers: [ShoesController],
  providers: [ShoesService],
  exports: [ShoesService],
})
export class ShoesModule {}