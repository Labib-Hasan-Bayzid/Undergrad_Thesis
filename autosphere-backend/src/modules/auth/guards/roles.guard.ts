import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // if no @Roles() attached, allow
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user; // comes from JwtStrategy.validate()

    return !!user?.role && roles.includes(user.role);
  }
}
