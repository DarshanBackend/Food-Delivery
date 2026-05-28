import mongoose from "mongoose";
import BannerModel from "../model/banner.model.js";
import CategoryModel from "../model/category.model.js";
import { uploadFile } from "../middleware/imageupload.js";
import { s3 } from "../utils/aws.config.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
    sendBadRequestResponse,
    sendSuccessResponse,
    sendErrorResponse,
    sendNotFoundResponse
} from "../utils/Response.utils.js";
import { ThrowError } from "../utils/Error.utils.js";


const getS3KeyFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split("amazonaws.com/");
    if (parts.length > 1) {
        return decodeURIComponent(parts[1]);
    }
    return null;
};

export class BannerController {
    
    static async createBanner(req, res) {
        try {
            const { title, description, category } = req.body;

            if (!title) {
                return sendBadRequestResponse(res, "Title is required");
            }

            if (!category || !mongoose.Types.ObjectId.isValid(category)) {
                return sendBadRequestResponse(res, "Valid category ID is required");
            }

            const categoryExists = await CategoryModel.findById(category);
            if (!categoryExists) {
                return sendBadRequestResponse(res, "Category not found");
            }

            if (!req.file) {
                return sendBadRequestResponse(res, "Banner image file is required");
            }

            
            const uploadResult = await uploadFile(req.file);

            const newBanner = await BannerModel.create({
                title,
                description: description || "",
                image: uploadResult.url,
                category
            });

            return sendSuccessResponse(res, "Banner created successfully", newBanner);
        } catch (error) {
            console.error("Create Banner Error:", error);
            return ThrowError(res, 500, error.message);
        }
    }

    
    static async getAllBanners(req, res) {
        try {
            const banners = await BannerModel.find().populate("category");
            if (!banners || banners.length === 0) {
                return sendSuccessResponse(res, "No banners found", []);
            }
            return sendSuccessResponse(res, "Banners fetched successfully", banners);
        } catch (error) {
            console.error("Get All Banners Error:", error);
            return ThrowError(res, 500, error.message);
        }
    }

    
    static async getBannerById(req, res) {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Banner ID");
            }

            const banner = await BannerModel.findById(id).populate("category");
            if (!banner) {
                return sendNotFoundResponse(res, "Banner not found");
            }

            return sendSuccessResponse(res, "Banner fetched successfully", banner);
        } catch (error) {
            console.error("Get Banner By ID Error:", error);
            return ThrowError(res, 500, error.message);
        }
    }

    
    static async updateBanner(req, res) {
        try {
            const { id } = req.params;
            const { title, description, category } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Banner ID");
            }

            const banner = await BannerModel.findById(id);
            if (!banner) {
                return sendNotFoundResponse(res, "Banner not found");
            }

            if (category) {
                if (!mongoose.Types.ObjectId.isValid(category)) {
                    return sendBadRequestResponse(res, "Invalid Category ID");
                }
                const categoryExists = await CategoryModel.findById(category);
                if (!categoryExists) {
                    return sendBadRequestResponse(res, "Category not found");
                }
                banner.category = category;
            }

            if (title !== undefined) banner.title = title;
            if (description !== undefined) banner.description = description;

            
            if (req.file) {
                
                const uploadResult = await uploadFile(req.file);

                
                if (banner.image) {
                    const oldKey = getS3KeyFromUrl(banner.image);
                    if (oldKey) {
                        try {
                            await s3.send(
                                new DeleteObjectCommand({
                                    Bucket: process.env.S3_BUCKET_NAME,
                                    Key: oldKey
                                })
                            );
                        } catch (delErr) {
                            console.error("Failed to delete old banner image from S3:", delErr.message);
                        }
                    }
                }

                banner.image = uploadResult.url;
            }

            await banner.save();
            return sendSuccessResponse(res, "Banner updated successfully", banner);
        } catch (error) {
            console.error("Update Banner Error:", error);
            return ThrowError(res, 500, error.message);
        }
    }

    
    static async deleteBanner(req, res) {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Banner ID");
            }

            const banner = await BannerModel.findById(id);
            if (!banner) {
                return sendNotFoundResponse(res, "Banner not found");
            }

            
            if (banner.image) {
                const key = getS3KeyFromUrl(banner.image);
                if (key) {
                    try {
                        await s3.send(
                            new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: key
                            })
                        );
                    } catch (delErr) {
                        console.error("Failed to delete banner image from S3:", delErr.message);
                    }
                }
            }

            await banner.deleteOne();
            return sendSuccessResponse(res, "Banner deleted successfully");
        } catch (error) {
            console.error("Delete Banner Error:", error);
            return ThrowError(res, 500, error.message);
        }
    }
}
