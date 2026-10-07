import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GuardAutenticacion } from './guard.js';
import { OtpService } from './otp.service.js';
import { PROVEEDOR_OTP, ProveedorOtpSimulador } from './proveedor-otp.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokensService,
    { provide: PROVEEDOR_OTP, useClass: ProveedorOtpSimulador },
    { provide: APP_GUARD, useClass: GuardAutenticacion },
  ],
  exports: [TokensService],
})
export class AuthModule {}
