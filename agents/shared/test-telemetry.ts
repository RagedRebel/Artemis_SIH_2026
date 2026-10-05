import { setupTelemetry } from './telemetry.js';
import { trace } from '@opentelemetry/api';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
console.log('LANGFUSE_PUBLIC_KEY:', process.env.LANGFUSE_PUBLIC_KEY);

setupTelemetry('test-service');

async function test() {
  const tracer = trace.getTracer('test-tracer');
  const span = tracer.startSpan('test-span');
  span.setAttribute('test.attribute', 'hello langfuse');
  span.end();
  
  console.log('Span ended. Forcing flush...');
  const provider = trace.getTracerProvider();
  if (provider && typeof (provider as any).forceFlush === 'function') {
    await (provider as any).forceFlush();
    console.log('Flushed.');
  }
}
test().catch(console.error);
