import { Injectable, Inject } from '@nestjs/common';
import type { AuthProvider } from '../auth/auth.interface';

@Injectable()
export class UsersService {
  constructor(@Inject('AuthProvider') private authProvider: AuthProvider) {}

  async register(email: string, password: string, role: string) {
    // AuthProvider.createUser(email, phone, password, metadata)
    const user = await this.authProvider.createUser(email, '', password, { role });
    return user;
  }
}
