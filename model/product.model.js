import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "category",
        required: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "seller",
        required: [true, "sellerId is required"]
    },
    product_name: {
        type: String,
        required: true
    },
    product_image: {
        url: { type: String, default: null },
        key: { type: String, default: null }
    },
    product_gallery_image: [
        {
            url: { type: String, default: null },
            key: { type: String, default: null }
        }
    ]
}, { timestamps: true });

export default mongoose.model("product", productSchema);