import mongoose from "mongoose";


const countdownSchema = new mongoose.Schema({
    days: { type: Number, default: 0 },
    hours: { type: Number, default: 0 },
    minutes: { type: Number, default: 0 },
    seconds: { type: Number, default: 0 },
}, { _id: false }); 

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
            ref: "category"
        },

        
        isSpecialOffer: {
            type: Boolean,
            default: false, 
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
        timestamps: true, 
    }
);

const offerModel = mongoose.model("offer", offerSchema);

export default offerModel;
