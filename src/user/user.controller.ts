import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  @Public()
  @Get('public-info')
  getPublicInfo() {
    return { message: 'This endpoint is public!' };
  }

  @Roles('user')
  @Get('user-data')
  getUserData(@Req() req: Request) {
    // SupabaseAuthGuard attaches the authenticated user (and role) to request.user
    const user = (req as any).user || null;
    const resUser = {role:user.role, email:user.email, id:user.id};
    console.log('Authenticated user:', resUser);
    return { message: 'This endpoint is for all users', user:user };
  }

  @Roles('admin')
  @Get('admin-data')
  getAdminData() {
    return { message: 'This endpoint is for admins only!' };
  }

  @Roles('manager')
  @Get('restricted-data')
  getRestrictedData() {
    return { message: 'This endpoint is for admins or managers!' };
  }
}
