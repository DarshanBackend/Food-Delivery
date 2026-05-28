import mongoose from "mongoose";
import { uploadFile } from "../middleware/imageupload.js";
import offerModel from "../model/offer.model.js";
import { s3 } from "../utils/aws.config.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";


const getS3KeyFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split("amazonaws.com/");
    if (parts.length > 1) {
        return decodeURIComponent(parts[1]);
    }
    return null;
};


export const createOfferController = async (req, res) => {
    try {
        const {
            offerTitle,
            offerDesc,
            category,
        } = req.body;

        if (!offerTitle || !offerDesc || !category) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Offer image is required" });
        }

        
        const result = await uploadFile(req.file);

        const countdownData = req.body.countdown
            ? JSON.parse(req.body.countdown)
            : undefined;

        
        const newOffer = await offerModel.create({
            offerTitle,
            offerDesc,
            offerImage: result.url,
            category,
            isSpecialOffer: req.body.isSpecialOffer === "true" || req.body.isSpecialOffer === true || false,
            discountPercent: Number(req.body.discountPercent) || 0,
            headline: req.body.headline || "",
            subText: req.body.subText || "",
            countdown: countdownData,
        });

        res.status(201).json({ success: true, data: newOffer });
    } catch (error) {
        console.error("Create Offer Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export const getAllOffersController = async (req, res) => {
    try {
        const offers = await offerModel.find({}).populate("category");

        if (offers.length === 0) {
            return res.status(404).json({ success: false, message: "No offers found" });
        }

        res.status(200).json({ success: true, count: offers.length, data: offers });
    } catch (error) {
        console.error("Get All Offers Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export const getOfferByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid offer ID" });
        }

        const offer = await offerModel.findById(id).populate("category");
        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        res.status(200).json({ success: true, data: offer });
    } catch (error) {
        console.error("Get Offer By ID Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export const updateOfferController = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid offer ID" });
        }

        const offer = await offerModel.findById(id);
        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        const { offerTitle, offerDesc, category, isSpecialOffer, discountPercent, headline, subText } = req.body;

        if (offerTitle) offer.offerTitle = offerTitle;
        if (offerDesc) offer.offerDesc = offerDesc;

        if (category) {
            if (!mongoose.Types.ObjectId.isValid(category)) {
                return res.status(400).json({ success: false, message: "Invalid category ID" });
            }
            offer.category = category;
        }

        if (isSpecialOffer !== undefined) {
            offer.isSpecialOffer = isSpecialOffer === "true" || isSpecialOffer === true;
        }
        if (discountPercent !== undefined) offer.discountPercent = Number(discountPercent);
        if (headline !== undefined) offer.headline = headline;
        if (subText !== undefined) offer.subText = subText;

        if (req.body.countdown) {
            try {
                offer.countdown = JSON.parse(req.body.countdown);
            } catch (err) {
                return res.status(400).json({ success: false, message: "Invalid countdown format (must be JSON)" });
            }
        }

        
        if (req.file) {
            
            const result = await uploadFile(req.file);

            
            if (offer.offerImage) {
                const oldKey = getS3KeyFromUrl(offer.offerImage);
                if (oldKey) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET_NAME,
                            Key: oldKey
                        }));
                    } catch (delErr) {
                        console.error("Failed to delete old offer image from S3:", delErr.message);
                    }
                }
            }

            offer.offerImage = result.url;
        }

        await offer.save();
        res.status(200).json({ success: true, data: offer });
    } catch (error) {
        console.error("Update Offer Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export const deleteOfferController = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid offer ID" });
        }

        const offer = await offerModel.findById(id);
        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        
        if (offer.offerImage) {
            const key = getS3KeyFromUrl(offer.offerImage);
            if (key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: key
                    }));
                } catch (delErr) {
                    console.error("Failed to delete offer image from S3:", delErr.message);
                }
            }
        }

        await offer.deleteOne();
        res.status(200).json({ success: true, message: "Offer deleted successfully" });
    } catch (error) {
        console.error("Delete Offer Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
