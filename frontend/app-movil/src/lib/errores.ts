/** Traduce el error de Supabase al enviar un correo. El límite de envíos es el más común con el SMTP por defecto. */
export function mensajeDeError(e: { status?: number; code?: string; message?: string }): string {
  if (e.status === 429 || e.code === 'over_email_send_rate_limit' || /rate limit/i.test(e.message ?? '')) {
    return 'Se alcanzó el límite de correos por ahora. Espera unos minutos y vuelve a intentarlo.'
  }
  return 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.'
}
