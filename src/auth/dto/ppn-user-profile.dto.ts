export class PpnUserProfileDto {
  id?: number | null;
  type?: string | null;
  userId?: string | null;
  accountNo?: number | null;
  membershipGrpId?: number | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  phoneNumber?: string | null;
  timeZone?: string | null;
  timeFormat?: string | null;
  lastLoginDate?: Date | null;
  photo?: string | null;
  status?: number | null;
  options?: string | null;
  addedBy?: string | null;
  addedDate?: Date | null;
  modifiedBy?: string | null;
  modifiedDate?: Date | null;
  supabaseMigrated?: boolean;
  legacyAuthenticated?: boolean;
}
