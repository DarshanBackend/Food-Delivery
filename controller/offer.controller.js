import { uploadFile } from "../middleware/imageUpload.js";
import offerModel from "../model/offer.model.js";

export const createOfferController = async (req, res) => {
    try {
        const {
            offerTitle,
            offerDesc,
            category,
            isSpecialOffer = false, // optional, default false
            discountPercent = 0,
            headline = "",
            subText = "",
            countdown = null, // optional countdown object: { days, hours, minutes, seconds }
        } = req.body;

        if (!offerTitle || !offerDesc || !category) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Offer image is required" });
        }

        // Upload image to S3
        const result = await uploadFile(req.file);

        const countdownData = req.body.countdown
            ? JSON.parse(req.body.countdown)
            : undefined;


        // Create Offer
        const newOffer = await offerModel.create({
            offerTitle,
            offerDesc,
            offerImage: result.url,
            category,
            isSpecialOffer: req.body.isSpecialOffer === "true" || false,
            discountPercent: req.body.discountPercent || 0,
            headline: req.body.headline || "",
            subText: req.body.subText || "",
            countdown: countdownData,
        });


        res.status(201).json({ success: true, data: newOffer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};
