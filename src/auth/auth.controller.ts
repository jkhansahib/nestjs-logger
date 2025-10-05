import { Controller, Post, Body, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly Auth: AuthService) {}

  @Public()
  @Post('signup')
  async signUp(@Body() body: { username: string; password: string }) {
    console.log(`AuthController.signUp called for ${body.username}`);
    if (!body.username || !body.password) {
      throw new UnauthorizedException('Username and password are required');
    }
    
    return this.Auth.signUp(body.username, body.password);
  }

  @Public()
  @Post('signin')
  async signIn(@Body() body: { username: string; password: string }) {
    try {
      if (!body.username || !body.password) {
        throw new UnauthorizedException('Username and password are required');
      }   
      return this.Auth.signIn(body.username, body.password);
    } catch (error) {
      console.error('Error during signIn:', error);
      throw error; // Re-throw the error after logging it
    }
    
  }

  // --- Anonymous login
  @Public()
  @Post('anonymous')
  async anonymous() {
    const result = await this.Auth.anonymousLogin();
    return result;
  }

  // --- Refresh token exchange
  @Public()
  @Post('refresh')
  async refreshToken(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('refresh_token is required');
    const result = await this.Auth.refreshAccessToken(refreshToken);
    return result;
  }

  // --- Revoke refresh token / signout
  @Public()
  @Post('revoke')
  async revoke(@Body('token') token: string) {
    if (!token) throw new UnauthorizedException('token is required');
    const result = await this.Auth.revokeRefreshToken(token);
    return result;
  }

  // --- Sign out
  @Post('signout')
  async signOut(@Req() req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException('Missing Authorization header');
    const token = authHeader.split(' ')[1];
    if (!token) throw new UnauthorizedException('Invalid token');

    const result = await this.Auth.signOut(token);
    return result;
  }

  // --- Change password (authenticated)
  @Post('change-password')
  async changePassword(@Body() body: { userIdOrAccessToken: string; oldPassword?: string; newPassword: string }) {
    const { userIdOrAccessToken, oldPassword = null, newPassword } = body;
    if (!userIdOrAccessToken || !newPassword) throw new UnauthorizedException('userIdOrAccessToken and newPassword required');
    const result = await this.Auth.changePassword(userIdOrAccessToken, oldPassword, newPassword);
    return result;
  }

  // --- Forgot / send reset
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    if (!email) throw new UnauthorizedException('email required');
    const result = await this.Auth.sendPasswordReset(email);
    //TODO: email is sent, need to work on front-end to handle reset link
    return result;
  }

  // --- Reset password (admin or code)
  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { userIdOrCode: string; newPassword: string }) {
    const { userIdOrCode, newPassword } = body;
    if (!userIdOrCode || !newPassword) throw new UnauthorizedException('userIdOrCode and newPassword required');
    const result = await this.Auth.resetPassword(userIdOrCode, newPassword);
    return result;
  }

  // --- Token introspection
  @Public()
  @Post('introspect')
  async introspect(@Body('token') token: string) {
    if (!token) throw new UnauthorizedException('token required');
    const result = await this.Auth.introspectToken(token);
    return result;
  }

  // --- Verify token / get user
  @Public()
  @Post('verify')
  async verify(@Body('token') token: string) {
    if (!token) throw new UnauthorizedException('token required');
    // ask AuthService to verify/introspect and return user
    const result = await this.Auth.introspectToken(token);
    return result;
  }

}
