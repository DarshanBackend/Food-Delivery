import multer from "multer";
import sharp from "sharp";
import path from "path";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

// S3 Client
const s3 = new S3Client({
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: String(process.env.S3_ACCESS_KEY).trim(),
        secretAccessKey: String(process.env.S3_SECRET_KEY).trim()
    }
});

// Map fields → S3 folder
const getS3Folder = (fieldname) => {
    switch (fieldname) {
        case "category_image":
            return "category_images";
        case "image":
            return "images";
        default:
            throw new Error(`Invalid field name: ${fieldname}`);
    }
};

// Multer memory storage (images only)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith("image/");
        const isOctetStream = file.mimetype === "application/octet-stream";
        const ext = path.extname(file.originalname).toLowerCase();
        const isJfif = ext === ".jfif";

        if (["category_image", "image"].includes(file.fieldname)) {
            return (isImage || isOctetStream || isJfif)
                ? cb(null, true)
                : cb(new Error("Invalid image file."));
        }

        return cb(new Error(`Invalid field name for upload: ${file.fieldname}`));
    }
});

// Convert JFIF → JPEG + upload to S3
const processAndUploadMedia = async (req, res, next) => {
    if (!req.files) return next();

    try {
        req.s3Files = {};

        for (const fieldname of Object.keys(req.files)) {
            const file = req.files[fieldname][0];
            const ext = path.extname(file.originalname).toLowerCase();
            const shouldConvert = ext === ".jfif" || file.mimetype === "application/octet-stream";

            const buffer = shouldConvert
                ? await sharp(file.buffer).jpeg().toBuffer()
                : file.buffer;

            const folder = getS3Folder(fieldname);
            const fileName = `${Date.now()}.jpeg`;
            const key = `${folder}/${fileName}`;

            await s3.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: "image/jpeg",
            }));

            req.s3Files[fieldname] = {
                url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`,
                key
            };
        }

        next();
    } catch (err) {
        console.error("S3 Upload Error:", err);
        return res.status(500).json({
            success: false,
            message: "Image upload failed",
            error: err.message
        });
    }
};

// Export upload fields (image only)
export const uploadMedia = upload.fields([
    { name: "category_image", maxCount: 1 },
    { name: "image", maxCount: 1 }
]);

export { upload, processAndUploadMedia };
