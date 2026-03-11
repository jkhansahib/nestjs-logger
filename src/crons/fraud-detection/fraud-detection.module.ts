import { Module } from "@nestjs/common";
import { FraudDetectionCron } from "./fraud-detection.cron";
import { FraudDetectionController } from "./fraud-detection.controller";
import { AppConfigModule } from "../../config/config.module";

@Module({
  imports: [
    AppConfigModule,
  ],
  providers: [
    FraudDetectionCron,
  ],
  controllers: [
    FraudDetectionController,
  ],
})
export class FraudDetectionModule {}
