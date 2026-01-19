import { Role } from '../enums';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: Role;
  jti: string; // unique token id (for blacklist)
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string; // userId
  jti: string; // refresh token id
  iat?: number;
  exp?: number;
}
