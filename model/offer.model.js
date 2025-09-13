import mongoose from "mongoose";

// Optional countdown schema
const countdownSchema = new mongoose.Schema({
    days: { type: Number, default: 0 },
    hours: { type: Number, default: 0 },
    minutes: { type: Number, default: 0 },
    seconds: { type: Number, default: 0 },
}, { _id: false }); // no separate _id for subdocument

const offerSchema = new mongoose.Schema(
    {
        offerTitle: {
            type: String,
            required: [true, "Offer title is required"],
            trim: true,
        },
        offerDesc: {
            type: String,
            trim: true,
        },
        offerImage: {
            type: String,
            required: [true, "Offer image is required"],
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category"
        },

        // New optional fields
        isSpecialOffer: {
            type: Boolean,
            default: false, // existing controllers won't be affected
        },
        discountPercent: {
            type: Number,
            default: 0,
        },
        headline: {
            type: String,
            trim: true,
        },
        subText: {
            type: String,
            trim: true,
        },
        countdown: countdownSchema,
    },
    {
        timestamps: true, // createdAt & updatedAt
    }
);

const offerModel = mongoose.model("offer", offerSchema);

export default offerModel;
