import { Logger } from "@nestjs/common";
import { FraudDetectionRepository } from "./repository";
import { DatabaseService } from "@repository/database-service";
import { AlertStatus } from "./types";
import { sendFraudEmail } from "./email.service";
import axios from "axios";
const repository = new FraudDetectionRepository(new DatabaseService());
const logger = new Logger("FraudDetectionProcessor");

const skippenAccount = 1399216;

interface FraudConfig {
  warnLevel: number;
  disconnectLevel: number;
  alertToEmail1: string;
  alertToEmail2: string;
  alertFromEmail: string;
  heartbeatUrl?: string;
  sendGridApiKey: string;
}

export async function processFraudDetection(
  config: FraudConfig
): Promise<void> {
  try {
    if (config.heartbeatUrl) {
      const response = await axios.get(config.heartbeatUrl);
      logger.debug(`Heartbeat called with response ${response.data}`);
    }

    logger.log(`SMS Fraud Checking at [${new Date().toISOString()}]`);

    const accountsToCheck = await repository.getTrialAccountsToCheck();

    for (const accountNoStr of accountsToCheck) {
      const accountNo = parseInt(accountNoStr);

      logger.log(
        `Checking account [${accountNo}] at [${new Date().toISOString()}]`
      );

      if (accountNo === skippenAccount) {
        logger.log(`***** skipped account [${accountNo}] *******`);
        continue;
      }

      const model = await repository.checkAccount(accountNo);
      const fraudScore = model.fraudScore;

      if (
        fraudScore > config.disconnectLevel &&
        !(await repository.alreadyAlerted(accountNo, AlertStatus.DISCONNECT))
      ) {
        await sendFraudEmail(
          config.sendGridApiKey,
          config.alertFromEmail,
          model,
          `DISCONNECT for account ${accountNo}`,
          config.alertToEmail1,
          config.alertToEmail2
        );
        await repository.insertAlert(
          accountNo,
          `FraudScore=${fraudScore}`,
          AlertStatus.DISCONNECT
        );
        const alertTimestamp = new Date()
          .toISOString()
          .replace("T", " ")
          .substring(0, 23);
        logger.log(
          `SMS Fraud Detected - suspending account [${accountNo}] at [${alertTimestamp}] with score [${fraudScore}]`
        );
      } else if (
        fraudScore > config.warnLevel &&
        !(await repository.alreadyAlerted(accountNo, AlertStatus.WARNING))
      ) {
        await sendFraudEmail(
          config.sendGridApiKey,
          config.alertFromEmail,
          model,
          `ALERT for account ${accountNo}`,
          config.alertToEmail1,
          config.alertToEmail2
        );
        await repository.insertAlert(
          accountNo,
          `FraudScore=${fraudScore}`,
          AlertStatus.WARNING
        );
        const alertTimestamp = new Date()
          .toISOString()
          .replace("T", " ")
          .substring(0, 23);
        logger.log(
          `SMS Fraud Detected - alerting for account [${accountNo}] at [${alertTimestamp}] with score [${fraudScore}]`
        );
      }
    }
  } catch (error) {
    logger.error(`Exception thrown with message ${(error as Error).message}`);
  }
}
