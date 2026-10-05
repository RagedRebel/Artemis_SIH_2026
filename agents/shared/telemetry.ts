import { maybeSetOtelProviders } from '@google/adk';

export function setupTelemetry(serviceName: string) {
  // Auto-configure Langfuse OpenTelemetry headers
  const pubKey = process.env.LANGFUSE_PUBLIC_KEY?.replace(/['"]/g, '');
  const secKey = process.env.LANGFUSE_SECRET_KEY?.replace(/['"]/g, '');

  if (pubKey && secKey) {
    const langfuseAuth = Buffer.from(`${pubKey}:${secKey}`).toString('base64');
    
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'https://cloud.langfuse.com/api/public/otel';
    // Append /v1/traces to match standard OTLP formatting if using the default endpoint
    if (!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT && process.env.OTEL_EXPORTER_OTLP_ENDPOINT === 'https://cloud.langfuse.com/api/public/otel') {
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'https://cloud.langfuse.com/api/public/otel/v1/traces';
    }
    process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Basic ${langfuseAuth}`;
  }

  if (
    !process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ) {
    return;
  }

  console.log(`[Telemetry] Initializing OpenTelemetry for ${serviceName}...`);
  process.env.OTEL_SERVICE_NAME = serviceName;

  // maybeSetOtelProviders automatically pulls OTEL_EXPORTER_OTLP_ENDPOINT 
  // and headers from the environment variables to set up Langfuse/OTel tracing
  maybeSetOtelProviders();
}
