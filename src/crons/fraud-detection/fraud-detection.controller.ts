import { Controller, Post, Get } from "@nestjs/common";
import { FraudDetectionCron } from "./fraud-detection.cron";

@Controller("fraud-detection")
export class FraudDetectionController {
  constructor(private readonly fraudDetectionCron: FraudDetectionCron) {}

  @Post("trigger")
  async triggerManually() {
    await this.fraudDetectionCron.handleFraudDetection();
    return { message: "Fraud detection triggered manually" };
  }

  @Get("status")
  getStatus() {
    return {
      status: "active",
      schedule: "Every 30 minutes",
      message: "Fraud detection is running",
    };
  }
}
