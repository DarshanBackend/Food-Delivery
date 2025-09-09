import mongoose from "mongoose"

const productSchema = mongoose.Schema({
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "category",
        required: true
    },
    product_name: {
        type: String,
        required: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "seller",
        required: [true, "sellerId is reqquired"]
    }
}, { timestamps: true })

export default mongoose.model("product", productSchema);
