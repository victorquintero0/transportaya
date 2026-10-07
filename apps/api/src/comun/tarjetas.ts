/** Resultado de intentar cobrar a una tarjeta. Con Wompi real, esto lo decide la pasarela. */
export function cobroSimulado(tokenProveedor: string | null | undefined): 'aprobado' | 'rechazado' {
  return tokenProveedor?.includes('declinada') ? 'rechazado' : 'aprobado';
}

export function marcaDeTarjeta(numero: string): string {
  if (/^4/.test(numero)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(numero)) return 'Mastercard';
  if (/^3[47]/.test(numero)) return 'American Express';
  if (/^(36|38|30[0-5])/.test(numero)) return 'Diners';
  return 'Tarjeta';
}

/** Algoritmo de Luhn: detecta números mal digitados antes de enviarlos a la pasarela. */
export function luhnValido(numero: string): boolean {
  let suma = 0;
  let doble = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = Number(numero[i]);
    if (doble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}
