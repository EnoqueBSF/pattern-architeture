import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DiagramSchema } from './schema.js';

const jsonSchema = z.toJSONSchema(DiagramSchema, { io: 'input' });
const outPath = fileURLToPath(new URL('../../schema/diagram.schema.json', import.meta.url));
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n', 'utf-8');
console.log(`JSON Schema gerado em ${outPath}`);
