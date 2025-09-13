import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    discountType: {
        type: String,
        enum: ["percentage", "flat"], // % discount or fixed amount
        required: true,
    },
    discountValue: {
        type: Number,
        required: true,
    },
    minOrderValue: {
        type: Number,
        default: 0, // minimum order value to apply
    },
    maxDiscount: {
        type: Number, // optional: for percentage discount
    },
    expiryDate: {
        type: Date,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

const couponModel = mongoose.model("Coupon", couponSchema);

export default couponModel;