import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '../entities/resource.entity';
import { ResourcesService } from './resources.service';

@Global()
@Module({ imports: [TypeOrmModule.forFeature([Resource])], providers: [ResourcesService], exports: [ResourcesService] })
export class ResourcesModule {}
