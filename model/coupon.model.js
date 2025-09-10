import mongoose from "mongoose";

const couponSchema = mongoose.Schema({
    name: {
        type: String1
    },
    description: {
        type: String
    },
    price: {
        type: Number
    },
    isPublic: {
        type: Boolean,
        enum: ["True", "False"],
        default: true
    }
}, { timestamps: true })


export default mongoose.model("coupon", couponSchema)