import multer from "multer";
import sharp from "sharp";
import path from "path";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

// AWS S3 Client
const s3 = new S3Client({
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    }
});

// Multer → Memory storage (file is stored in RAM)
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Function to upload a single file to S3
export const uploadFile = async (file) => {
    if (!file) throw new Error("No file provided");

    // Handle JFIF or octet-stream → Convert to JPEG
    const ext = path.extname(file.originalname).toLowerCase();
    const shouldConvert = ext === ".jfif" || file.mimetype === "application/octet-stream";

    const buffer = shouldConvert
        ? await sharp(file.buffer).jpeg().toBuffer()
        : file.buffer;

    // File key (folder + timestamp)
    const fileName = `${Date.now()}.jpeg`;
    const key = `uploads/${fileName}`;

    // Upload to S3
    await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "image/jpeg",
    }));

    // Return uploaded file info
    return {
        url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`,
        key
    };
};
