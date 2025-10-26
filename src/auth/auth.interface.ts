export interface AuthProvider {
  // Create a user via admin API. Provide explicit email and/or phone. Password required for admin create.
  // confirmEmail: when true, skip sending confirmation (depends on provider behavior)
  createUser(email: string, phone: string, password: string, roles?: any, confirmEmail?: boolean): Promise<any>;

  // Public signup (may trigger provider-delivered confirmation/OTP). Password may be optional for phone-only flows.
  signup(email: string, phone: string, password?: string): Promise<any>;

  getUserById(userId: string): Promise<any>;
  assignRole(userId: string, role: string): Promise<any>;
  signInWithPassword(email: string, password: string): Promise<any>;

  // Optional: issue a custom token (e.g. server-signed JWT containing roles/claims)
  issueToken?(user: any): Promise<any>;
  verifyToken(token: string): Promise<any>;

  // Optional advanced flows — providers may implement these
  refreshToken?(refreshToken: string): Promise<any>;
  revokeRefreshToken?(refreshToken: string): Promise<any>;
  signOut?(accessToken: string): Promise<any>;
  changePassword?(userIdOrAccessToken: string, oldPassword: string | null, newPassword: string): Promise<any>;
  sendPasswordReset?(email: string): Promise<any>;
  resetPassword?(accessTokenOrCode: string, newPassword: string): Promise<any>;
  introspectToken?(token: string): Promise<any>;
  // Optional anonymous sign-in support
  signInAnonymously?(): Promise<any>;

  // Optional: find a user by email or phone (provider-backed lookup)
  getUserByEmail?(email: string): Promise<any | null>;
  getUserByPhone?(phone: string): Promise<any | null>;

  // --- Optional phone-based OTP flows
  // Send an OTP (e.g. via SMS) to a phone number (E.164). channel optional (sms/voice)
  sendOtpToPhone?(phone: string, channel?: 'sms' | 'voice'): Promise<any>;
  // Verify an OTP token for a phone number and sign-in/return session
  verifyPhoneOtp?(phone: string, token: string, device: any): Promise<any>;
}
