import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    discountType: { type: String, required: true }, // percentage or flat
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    sellerId: { type: mongoose.Types.ObjectId, ref: "seller", default: null } // restrict to seller
}, { timestamps: true });

const couponModel = mongoose.model("coupon", couponSchema);

export default couponModel;