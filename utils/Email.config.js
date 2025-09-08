import nodemailer from 'nodemailer'
import { config } from 'dotenv'; config();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: true,
    auth: {
        user: process.env.SMTP_EMAIL || 'hit.kalathiyainfotech@gmail.com',
        pass: process.env.SMTP_PASS || 'sxbrlqfwsuawoczh',
    },
});


export default transporter