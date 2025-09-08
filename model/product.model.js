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
}, { timestamps: true })

export default mongoose.model("product", productSchema);
