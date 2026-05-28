import mongoose from "mongoose";
import variantModel from "../model/variant.model.js";
import stockModel from "../model/stock.model.js";
import productModel from "../model/product.model.js";
import { uploadFile } from "../middleware/imageupload.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../utils/aws.config.js";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import { getCurrencyRate, convertPrice } from "../utils/currency.utils.js";

export const createVariantController = async (req, res) => {
    try {
        const { productId } = req.params;
        const { weight, unit, price, originalPrice, discount, initialStock } = req.body;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Invalid product ID");
        }

        const product = await productModel.findById(productId);
        if (!product) {
            return sendNotFoundResponse(res, "Product not found");
        }

        if (!weight || isNaN(weight) || weight <= 0) {
            return sendBadRequestResponse(res, "Valid weight is required");
        }

        const allowedUnits = ["g", "kg", "ml", "l", "pc"];
        if (!unit || !allowedUnits.includes(unit)) {
            return sendBadRequestResponse(res, `Invalid unit. Allowed: ${allowedUnits.join(", ")}`);
        }

        if (price == null || isNaN(price) || price < 0) {
            return sendBadRequestResponse(res, "Valid price is required");
        }

        let variantImg = null;
        let variantImgKey = null;
        const mainImageFile = req.files?.productImage?.[0] || req.file;
        if (mainImageFile) {
            const result = await uploadFile(mainImageFile);
            variantImg = result.url;
            variantImgKey = result.key;
        }

        let galleryImages = [];
        if (req.files?.gImage) {
            for (const file of req.files.gImage) {
                const result = await uploadFile(file);
                galleryImages.push({ gImage: result.url, gImageKey: result.key });
            }
        }

        const newVariant = await variantModel.create({
            productId,
            weight: Number(weight),
            unit,
            price: Number(price),
            originalPrice: originalPrice ? Number(originalPrice) : null,
            discount: discount ? Number(discount) : 0,
            variantImage: variantImg,
            variantImageKey: variantImgKey,
            gImage: galleryImages
        });

        const qty = initialStock ? Number(initialStock) : 0;
        await stockModel.create({
            productId,
            variantId: newVariant._id,
            quantity: qty >= 0 ? qty : 0
        });

        return sendSuccessResponse(res, "Variant created successfully", newVariant);
    } catch (error) {
        console.error("Error creating variant:", error);
        return sendErrorResponse(res, 500, "Error creating variant", error.message);
    }
};

export const updateVariantController = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { weight, unit, price, originalPrice, discount } = req.body;

        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendBadRequestResponse(res, "Invalid variant ID");
        }

        const variant = await variantModel.findById(variantId);
        if (!variant) {
            return sendNotFoundResponse(res, "Variant not found");
        }

        if (weight != null) {
            if (isNaN(weight) || weight <= 0) {
                return sendBadRequestResponse(res, "Valid weight must be positive");
            }
            variant.weight = Number(weight);
        }

        if (unit != null) {
            const allowedUnits = ["g", "kg", "ml", "l", "pc"];
            if (!allowedUnits.includes(unit)) {
                return sendBadRequestResponse(res, `Invalid unit. Allowed: ${allowedUnits.join(", ")}`);
            }
            variant.unit = unit;
        }

        if (price != null) {
            if (isNaN(price) || price < 0) {
                return sendBadRequestResponse(res, "Price must be >= 0");
            }
            variant.price = Number(price);
        }

        if (originalPrice !== undefined) {
            variant.originalPrice = originalPrice ? Number(originalPrice) : null;
        }

        if (discount != null) {
            variant.discount = Number(discount);
        }

        const mainImageFile = req.files?.productImage?.[0] || req.file;
        if (mainImageFile) {
            if (variant.variantImageKey) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: variant.variantImageKey
                    }));
                } catch (delErr) {
                    console.error("Failed to delete old variant image:", delErr.message);
                }
            }
            const result = await uploadFile(mainImageFile);
            variant.variantImage = result.url;
            variant.variantImageKey = result.key;
        }

        if (req.files?.gImage && req.files.gImage.length > 0) {
            if (variant.gImage && variant.gImage.length > 0) {
                for (const img of variant.gImage) {
                    if (img.gImageKey) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: img.gImageKey
                            }));
                        } catch (delErr) {
                            console.error("Failed to delete old gallery image:", delErr.message);
                        }
                    }
                }
            }

            const galleryImages = [];
            for (const file of req.files.gImage) {
                const result = await uploadFile(file);
                galleryImages.push({ gImage: result.url, gImageKey: result.key });
            }
            variant.gImage = galleryImages;
        }

        await variant.save();
        return sendSuccessResponse(res, "Variant updated successfully", variant);
    } catch (error) {
        console.error("Error updating variant:", error);
        return sendErrorResponse(res, 500, "Error updating variant", error.message);
    }
};

export const deleteVariantController = async (req, res) => {
    try {
        const { variantId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendBadRequestResponse(res, "Invalid variant ID");
        }

        const variant = await variantModel.findById(variantId);
        if (!variant) {
            return sendNotFoundResponse(res, "Variant not found");
        }

        if (variant.variantImageKey) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: variant.variantImageKey
                }));
            } catch (err) {
                console.error("Failed to delete variant image:", err.message);
            }
        }

        if (variant.gImage && variant.gImage.length > 0) {
            for (const img of variant.gImage) {
                if (img.gImageKey) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET_NAME,
                            Key: img.gImageKey
                        }));
                    } catch (err) {
                        console.error("Failed to delete gallery image:", err.message);
                    }
                }
            }
        }

        await variant.deleteOne();
        await stockModel.deleteOne({ variantId });

        return sendSuccessResponse(res, "Variant deleted successfully");
    } catch (error) {
        console.error("Error deleting variant:", error);
        return sendErrorResponse(res, 500, "Error deleting variant", error.message);
    }
};

export const getVariantsByProductController = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Invalid product ID");
        }

        const variants = await variantModel.find({ productId }).populate("stock");
        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = variants.map(v => {
            const obj = v.toObject();
            obj.price = convertPrice(v.price, rate);
            obj.originalPrice = convertPrice(v.originalPrice, rate);
            obj.currency = currency;
            obj.stock = v.stock ? v.stock.quantity : 0;
            return obj;
        });

        return sendSuccessResponse(res, "Variants fetched successfully", {
            total: formatted.length,
            variants: formatted
        });
    } catch (error) {
        console.error("Error fetching variants:", error);
        return sendErrorResponse(res, 500, "Error fetching variants", error.message);
    }
};

export const getVariantByIdController = async (req, res) => {
    try {
        const { variantId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendBadRequestResponse(res, "Invalid variant ID");
        }

        const variant = await variantModel.findById(variantId).populate("stock").populate("productId");
        if (!variant) {
            return sendNotFoundResponse(res, "Variant not found");
        }

        const { rate, currency } = getCurrencyRate(req?.user);
        const obj = variant.toObject();
        obj.price = convertPrice(variant.price, rate);
        obj.originalPrice = convertPrice(variant.originalPrice, rate);
        obj.currency = currency;
        obj.stock = variant.stock ? variant.stock.quantity : 0;

        return sendSuccessResponse(res, "Variant fetched successfully", obj);
    } catch (error) {
        console.error("Error fetching variant:", error);
        return sendErrorResponse(res, 500, "Error fetching variant", error.message);
    }
};
