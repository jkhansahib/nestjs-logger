export class SendOtpDto {
  phone!: string;
  channel?: 'sms' | 'voice';
}
