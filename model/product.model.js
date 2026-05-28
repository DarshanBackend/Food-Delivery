import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    productName: { type: String, default: null },
    category: {
        type: mongoose.Types.ObjectId,
        ref: "category",
        required: [true, "category ref id is required"],
    },
    sellerId: {
        type: mongoose.Types.ObjectId,
        ref: "seller",
        required: [true, "seller id is required"]
    },
    soldCount: { type: Number, default: 0 },
    productDesc: { type: String, default: null },
    productHealthBenefit: { type: String, default: null },
    productStorage: { type: String, default: null }
}, { timestamps: true, id: false });

productSchema.virtual("variants", {
    ref: "variant",
    localField: "_id",
    foreignField: "productId"
});

productSchema.set("toObject", { virtuals: true, id: false });
productSchema.set("toJSON", { virtuals: true, id: false });

const productModel = mongoose.model("product", productSchema);
export default productModel;
