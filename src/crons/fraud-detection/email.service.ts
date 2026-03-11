import { Logger } from "@nestjs/common";
import { SmsFraudModel } from "./types";
import sgMail from "@sendgrid/mail";

const logger = new Logger("FraudEmailService");

export async function sendFraudEmail(
  sendGridApiKey: string,
  fromEmail: string,
  model: SmsFraudModel | null,
  subject: string,
  toEmail1: string,
  toEmail2: string
): Promise<void> {
  try {
    logger.log(`Attempting to send email: ${subject}`);
    logger.log(`SendGrid API Key provided: ${!!sendGridApiKey}`);
    logger.log(`From: ${fromEmail}`);
    logger.log(
      `To: ${[
        toEmail1,
        toEmail2,
      ]
        .filter(Boolean)
        .join(", ")}`
    );
    logger.log(`sgMail object:`, sgMail);

    sgMail.setApiKey(sendGridApiKey);

    const htmlBody = model
      ? `
      <h2>${subject}</h2>
      <table border="1" cellpadding="5">
        <tr><td>Account No</td><td>${model.accountNo}</td></tr>
        <tr><td>Age Hours</td><td>${model.ageHours}</td></tr>
        <tr><td>SMS Total</td><td>${model.smsTotal}</td></tr>
        <tr><td>SMS Per Minute</td><td>${model.smsPerMinute}</td></tr>
        <tr><td>Trial Active</td><td>${model.trialActive}</td></tr>
        <tr><td>Failure Percent</td><td>${model.failurePercent}%</td></tr>
        <tr><td>CC Risk Score</td><td>${model.ccRiskScore}</td></tr>
        <tr><td>Contains Email Percent</td><td>${model.containsEmailPercent}%</td></tr>
        <tr><td>Contains URL Percent</td><td>${model.containsUrlPercent}%</td></tr>
        <tr><td>Contains Keyword Percent</td><td>${model.containsKeywordPercent}%</td></tr>
        <tr><td>Unique Contact Percent</td><td>${model.uniqueContactPercent}%</td></tr>
        <tr><td><strong>Fraud Score</strong></td><td><strong>${model.fraudScore}</strong></td></tr>
      </table>
    `
      : `<p>${subject}</p>`;

    logger.log("Calling sgMail.send...", htmlBody);
    await sgMail.send({
      to: [
        toEmail1,
        toEmail2,
      ].filter(Boolean),
      from: fromEmail,
      subject,
      text: subject,
      html: htmlBody,
    });

    logger.log(`Email sent successfully: ${subject}`);
  } catch (error) {
    logger.error(`Failed to send email: ${(error as Error).message}`);
    logger.error(`Error details:`, error);
  }
}
