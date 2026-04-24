import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async sendOtp(email: string, otp: string) {
    await this.transporter.sendMail({
      from: `"Property Vault" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Your Password Reset OTP',
      text: `Your OTP is: ${otp}\nIt expires in 10 minutes.`,
    });
  }
}
