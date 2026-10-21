import { mensajeDeError } from './errores'

describe('mensajeDeError', () => {
  it('avisa del límite de correos', () => {
    expect(mensajeDeError({ status: 429 })).toMatch(/límite de correos/)
    expect(mensajeDeError({ code: 'over_email_send_rate_limit' })).toMatch(/límite de correos/)
    expect(mensajeDeError({ message: 'email rate limit exceeded' })).toMatch(/límite de correos/)
  })
  it('con otro error da un mensaje general', () => {
    expect(mensajeDeError({ status: 500, message: 'boom' })).toMatch(/No se pudo enviar/)
  })
})
