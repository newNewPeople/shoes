import { Global, Module } from '@nestjs/common';
import { LocalFileStorage } from '@/storage/local/local-file-storage';

@Global()
@Module({
  providers: [LocalFileStorage],
  exports: [LocalFileStorage],
})
export class StorageModule {}
