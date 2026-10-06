import { describe, expect, it } from 'vitest';
import { firmarJwt, verificarJwt } from './jwt.js';

const secreto = 'secreto-de-prueba-que-tiene-más-de-32-caracteres';
const payload = { sub: 'u1', sid: 's1', rol: 'conductor' as const };

describe('JWT', () => {
  it('firma y verifica', () => {
    const token = firmarJwt(payload, secreto, 60);
    expect(verificarJwt(token, secreto)).toMatchObject(payload);
  });
  it('rechaza un secreto distinto', () => {
    expect(
      verificarJwt(firmarJwt(payload, secreto, 60), 'otro-secreto-distinto-también-largo-1234'),
    ).toBeNull();
  });
  it('rechaza un token vencido', () => {
    const token = firmarJwt(payload, secreto, 60, Date.now() - 120_000);
    expect(verificarJwt(token, secreto)).toBeNull();
  });
  it('rechaza un cuerpo alterado', () => {
    const [h, , f] = firmarJwt(payload, secreto, 60).split('.') as [string, string, string];
    const falso = Buffer.from(
      JSON.stringify({ ...payload, rol: 'interno', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(verificarJwt(`${h}.${falso}.${f}`, secreto)).toBeNull();
  });
  it('rechaza el algoritmo "none" y cualquier otro encabezado', () => {
    const cuerpo = Buffer.from(JSON.stringify({ ...payload, iat: 1, exp: 9_999_999_999 })).toString(
      'base64url',
    );
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verificarJwt(`${none}.${cuerpo}.`, secreto)).toBeNull();
    expect(verificarJwt(`${none}.${cuerpo}.firma`, secreto)).toBeNull();
  });
  it('rechaza basura', () => {
    expect(verificarJwt('', secreto)).toBeNull();
    expect(verificarJwt('a.b', secreto)).toBeNull();
    expect(verificarJwt('a.b.c', secreto)).toBeNull();
  });
});
