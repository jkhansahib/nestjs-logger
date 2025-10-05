export interface AuthProvider {
  createUser(email: string, password: string, metadata?: any): Promise<any>;
  getUserById(userId: string): Promise<any>;
  assignRole(userId: string, role: string): Promise<any>;
  signIn(email: string, password: string): Promise<any>;
  // optional: issue a custom token (e.g. server-signed JWT containing roles/claims)
  issueToken?(user: any): Promise<string>;
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

  // Optional: find a user by email (provider-backed lookup)
  getUserByEmail?(email: string): Promise<any | null>;
}
