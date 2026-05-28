import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Types.ObjectId,
        ref: "product",
        required: [true, "Product ID is required for Stock"]
    },
    variantId: {
        type: mongoose.Types.ObjectId,
        ref: "variant",
        required: [true, "Variant ID is required for Stock"],
        unique: true
    },
    quantity: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

const stockModel = mongoose.model("stock", stockSchema);
export default stockModel;