import { Controller, Post, Body, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly supabaseAuth: SupabaseAuthService) {}

  @Public()
  @Post('signup')
  async signUp(@Body() body: { email: string; password: string }) {
    return this.supabaseAuth.signUp(body.email, body.password);
  }

  @Public()
  @Post('signin')
  async signIn(@Body() body: { email: string; password: string }) {
    return this.supabaseAuth.signIn(body.email, body.password);
  }

  //This is raw supabase sign in without server token/role augmentation
  // @Public()
  // @Post('signinBase')
  // async signInBase(@Body() body: { email: string; password: string }) {
  //   return this.supabaseAuth.signInBase(body.email, body.password);
  // }

   @Public()
  @Post('refresh')
  async refreshToken(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const session = await this.supabaseAuth.refreshAccessToken(refreshToken);

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      user: session.user,
    };
  }
}
