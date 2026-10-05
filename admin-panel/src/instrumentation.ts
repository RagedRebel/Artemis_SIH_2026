export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startIntegrationDispatcher } = await import('@/lib/integrations/dispatcher')
    startIntegrationDispatcher()
  }
}
