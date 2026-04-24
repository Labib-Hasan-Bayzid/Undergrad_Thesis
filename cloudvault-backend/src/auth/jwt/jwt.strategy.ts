import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev_secret_change_me',
    });
  }

  async validate(payload: any) {
  const id = payload?.sub || payload?.id || payload?.userId;

  return {
    id,                 // ✅ always expose id
    sub: payload?.sub,  // keep original too
    email: payload?.email,
    ...payload,
  };
}

}
