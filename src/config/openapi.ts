import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const { version } = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const config = new DocumentBuilder()
    .setTitle('Sauti Salama API')
    .setDescription([
      'Responder console API (`/api`, header `x-dashboard-token`) and the Africa\'s Talking callbacks (`/webhooks`, `?key=<WEBHOOK_SECRET>`).',
      'Webhook bodies are application/x-www-form-urlencoded, as Africa\'s Talking sends them.',
    ].join('\n\n'))
    .setVersion(version)
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-dashboard-token' }, 'dashboard-token')
    .build();
  return SwaggerModule.createDocument(app, config);
}
