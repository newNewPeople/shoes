import { Global, Module, OnModuleInit } from '@nestjs/common';
import { runMigrations } from '@/storage/database/migrate';
import { ShoesRepository } from '@/storage/database/shoes.repository';

@Global()
@Module({
  providers: [ShoesRepository],
  exports: [ShoesRepository],
})
export class DatabaseModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await runMigrations();
  }
}
