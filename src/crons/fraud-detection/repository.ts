import { Inject } from "@nestjs/common";
import {
  DATABASE_SERVICE_TOKEN,
  IDatabaseService,
} from "../../shared/interfaces";
import { AlertStatus, SmsFraudModel } from "./types";

export class FraudDetectionRepository {
  constructor(
    @Inject(DATABASE_SERVICE_TOKEN)
    private readonly databaseService: IDatabaseService
  ) {}

  async getTrialAccountsToCheck(): Promise<string[]> {
    const result =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.findMany({
        where: {
          MessageDirection: "OUTBOUND",
          AccountNo: { gt: 0 },
          ppn_Account: {
            Status: "1",
          },
        },
        select: {
          AccountNo: true,
        },
        orderBy: {
          AddedDate: "desc",
        },
        take: 100,
        distinct: [
          "AccountNo",
        ],
      });
    return result.map(r => r.AccountNo.toString());
  }

  async checkAccount(accountNo: number): Promise<SmsFraudModel> {
    const keywords = [
      "facebook",
      "craigslist",
      "kubota",
      "craiglist",
      "security",
      "honda",
      "accord",
      "polaris",
      "utv",
      "tractor",
      "reactivate",
      "urgent task",
      "conference meeting right now",
      "conference right now",
    ];

    const account = await this.databaseService.vumber.ppn_Account.findUnique({
      where: { AccountNo: accountNo },
      select: { ActivationDate: true, TrialActive: true },
    });
    if (!account?.ActivationDate)
      return {
        accountNo,
        ageHours: 0,
        smsTotal: 0,
        smsPerMinute: 0,
        trialActive: false,
        failurePercent: 0,
        ccRiskScore: 0,
        containsEmailPercent: 0,
        containsUrlPercent: 0,
        containsKeywordPercent: 0,
        uniqueContactPercent: 0,
        fraudScore: 0,
      };

    const ageHours = Math.floor(
      (Date.now() - account.ActivationDate.getTime()) / 3600000
    );
    if (ageHours > 336)
      return {
        accountNo,
        ageHours,
        smsTotal: 0,
        smsPerMinute: 0,
        trialActive: account.TrialActive,
        failurePercent: 0,
        ccRiskScore: 0,
        containsEmailPercent: 0,
        containsUrlPercent: 0,
        containsKeywordPercent: 0,
        uniqueContactPercent: 0,
        fraudScore: 0,
      };

    const smsTotal =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
        where: { AccountNo: accountNo, MessageDirection: "OUTBOUND" },
      });
    if (smsTotal < 10)
      return {
        accountNo,
        ageHours,
        smsTotal,
        smsPerMinute: 0,
        trialActive: account.TrialActive,
        failurePercent: 0,
        ccRiskScore: 0,
        containsEmailPercent: 0,
        containsUrlPercent: 0,
        containsKeywordPercent: 0,
        uniqueContactPercent: 0,
        fraudScore: 0,
      };

    const uniqueContact =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.groupBy({
        by: [
          "DNIS",
        ],
        where: { AccountNo: accountNo, MessageDirection: "OUTBOUND" },
        _count: true,
      });
    const uniqueContactPercent = (uniqueContact.length / smsTotal) * 100;

    const smsPerMinute =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
        where: {
          AccountNo: accountNo,
          AddedDate: { gt: new Date(Date.now() - 60000) },
        },
      });

    const failed =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
        where: {
          AccountNo: accountNo,
          MessageDirection: "OUTBOUND",
          DeliveryStatus: "DeliveryFailed",
        },
      });
    const failurePercent = (failed / smsTotal) * 100;

    let ccRiskScore = 0;
    if (!account.TrialActive) {
      const minFraud = await this.databaseService.vumber.ppn_MinFraud.findFirst(
        {
          where: { AccountNo: accountNo },
          orderBy: { RiskScore: "desc" },
          select: { RiskScore: true },
        }
      );
      ccRiskScore = minFraud?.RiskScore ? Number(minFraud.RiskScore) : 0;
    }

    const containsEmail =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
        where: {
          AccountNo: accountNo,
          MessageDirection: "OUTBOUND",
          MessageText: { contains: "@" },
        },
      });
    const containsEmailPercent = (containsEmail / smsTotal) * 100;

    const containsUrl =
      await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
        where: {
          AccountNo: accountNo,
          MessageDirection: "OUTBOUND",
          MessageText: { contains: "http" },
        },
      });
    const containsUrlPercent = (containsUrl / smsTotal) * 100;

    let containsKeywordCnt = 0;
    for (const keyword of keywords) {
      const cnt =
        await this.databaseService.vumber.ppn_MessageRoutedSummary.count({
          where: {
            AccountNo: accountNo,
            MessageDirection: "OUTBOUND",
            MessageText: { contains: keyword.trim() },
          },
        });
      containsKeywordCnt += cnt;
    }
    const containsKeywordPercent = (containsKeywordCnt / smsTotal) * 100;

    let fraudScore = 0;
    if (ageHours < 24) fraudScore += 10;
    if (account.TrialActive) fraudScore += 10;
    if (smsTotal > 100) fraudScore += 10;
    if (smsPerMinute > 3) fraudScore += 10;
    if (smsPerMinute > 5) fraudScore += 10;
    if (smsPerMinute > 60) fraudScore += 100;
    if (failurePercent > 50) fraudScore += 20;
    if (containsEmailPercent > 50) fraudScore += 20;
    if (containsUrlPercent > 50) fraudScore += 20;
    if (uniqueContactPercent > 70) fraudScore += 40;
    if (ccRiskScore > 30) fraudScore += 10;
    if (ccRiskScore > 60) fraudScore += 30;
    if (ccRiskScore > 90) fraudScore += 40;
    if (containsKeywordPercent > 50) fraudScore += 50;

    if (fraudScore > 99) {
      await this.databaseService.vumber.ppn_Account.update({
        where: { AccountNo: accountNo },
        data: { Status: "81" },
      });
    }

    return {
      accountNo,
      ageHours,
      smsTotal,
      smsPerMinute,
      trialActive: account.TrialActive,
      failurePercent,
      ccRiskScore,
      containsEmailPercent,
      containsUrlPercent,
      containsKeywordPercent,
      uniqueContactPercent,
      fraudScore,
    };
  }

  async alreadyAlerted(
    accountNo: number,
    status: AlertStatus
  ): Promise<boolean> {
    const result =
      await this.databaseService.vumber.ppn_AccountFraudAlert.findFirst({
        where: { AccountNo: accountNo, Status: status },
      });
    return !!result;
  }

  async insertAlert(
    accountNo: number,
    message: string,
    status: AlertStatus
  ): Promise<void> {
    await this.databaseService.vumber.ppn_AccountFraudAlert.create({
      data: {
        AccountNo: accountNo,
        Data: message,
        Status: status,
        AddedDate: new Date(),
        AddedBy: "fraud-detection-service",
      },
    });
  }
}
