import { Injectable, Logger } from '@nestjs/common';

export const PROVEEDOR_OTP = Symbol('PROVEEDOR_OTP');

/** Quien entrega el código al celular (D-13: WhatsApp con SMS de respaldo). Aún no hay proveedor. */
export interface ProveedorOtp {
  /** Si es `true`, el código se devuelve en la respuesta y la app lo muestra: solo para desarrollo. */
  readonly simulado: boolean;
  enviar(telefono: string, codigo: string): Promise<void>;
}

@Injectable()
export class ProveedorOtpSimulador implements ProveedorOtp {
  readonly simulado = true;
  private readonly log = new Logger('OTP simulado');

  async enviar(telefono: string, codigo: string): Promise<void> {
    this.log.log(`Código para ${telefono}: ${codigo}`);
  }
}
