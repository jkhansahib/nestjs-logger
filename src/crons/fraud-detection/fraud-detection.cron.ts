import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { APP_CONFIG } from "../../config/token";
import { AppConfig } from "../../config/schema";
import { processFraudDetection } from "./processor";
import { sendFraudEmail } from "./email.service";

@Injectable()
export class FraudDetectionCron {
  private readonly logger = new Logger(FraudDetectionCron.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit() {
    await new Promise(resolve => setTimeout(resolve, 30000));

    const fraudConfig = this.config.fraudDetection;
    if (fraudConfig) {
      this.logger.debug(`AlertToEmail1: ${fraudConfig.alertToEmail1}`);
      this.logger.debug(`AlertToEmail2: ${fraudConfig.alertToEmail2}`);
      this.logger.debug(`AlertFromEmail: ${fraudConfig.alertFromEmail}`);

      await sendFraudEmail(
        this.config.sendGrid.apiKey,
        fraudConfig.alertFromEmail,
        null,
        "Fraud Detection Service starting",
        fraudConfig.alertToEmail1,
        fraudConfig.alertToEmail2 || ""
      );
    }
  }

  @Cron("*/1 * * * *") // Every 1 minute (FOR TESTING - change back to EVERY_30_MINUTES)
  async handleFraudDetection(): Promise<void> {
    this.logger.log("Starting Fraud Detection Cron");

    const fraudConfig = this.config.fraudDetection;

    if (!fraudConfig) {
      this.logger.warn(
        "Fraud detection skipped: missing fraudDetection configuration"
      );
      return;
    }

    if (fraudConfig.warnLevel === undefined || fraudConfig.warnLevel === null) {
      this.logger.warn("Fraud detection skipped: missing warnLevel");
      return;
    }

    if (
      fraudConfig.disconnectLevel === undefined ||
      fraudConfig.disconnectLevel === null
    ) {
      this.logger.warn("Fraud detection skipped: missing disconnectLevel");
      return;
    }

    if (!fraudConfig.alertToEmail1) {
      this.logger.warn("Fraud detection skipped: missing alertToEmail1");
      return;
    }

    if (!fraudConfig.alertFromEmail) {
      this.logger.warn("Fraud detection skipped: missing alertFromEmail");
      return;
    }

    await processFraudDetection({
      warnLevel: fraudConfig.warnLevel,
      disconnectLevel: fraudConfig.disconnectLevel,
      alertToEmail1: fraudConfig.alertToEmail1,
      alertToEmail2: fraudConfig.alertToEmail2 || "",
      alertFromEmail: fraudConfig.alertFromEmail,
      heartbeatUrl: fraudConfig.heartbeatUrl,
      sendGridApiKey: this.config.sendGrid.apiKey,
    });
  }
}
