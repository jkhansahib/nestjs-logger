export enum AlertStatus {
  WARNING = 0,
  DISCONNECT = 1,
}

export interface SmsFraudModel {
  accountNo: number;
  ageHours: number;
  smsTotal: number;
  smsPerMinute: number;
  trialActive: boolean;
  failurePercent: number;
  ccRiskScore: number;
  containsEmailPercent: number;
  containsUrlPercent: number;
  containsKeywordPercent: number;
  uniqueContactPercent: number;
  fraudScore: number;
}
