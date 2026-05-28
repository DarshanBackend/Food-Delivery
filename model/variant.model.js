import mongoose from "mongoose";

const galleryImage = new mongoose.Schema({
    gImage: { type: String, default: null },
    gImageKey: { type: String, default: null }
});

const variantSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Types.ObjectId,
        ref: "product",
        required: [true, "Product ID is required for Variant"]
    },
    weight: { type: Number, required: true },
    unit: {
        type: String,
        enum: ["g", "kg", "ml", "l", "pc"],
        required: true
    },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },
    discount: { type: Number, default: 0 },
    variantImage: { type: String, default: null },
    variantImageKey: { type: String, default: null },
    gImage: [galleryImage]
}, { timestamps: true, id: false });

variantSchema.virtual("stock", {
    ref: "stock",
    localField: "_id",
    foreignField: "variantId",
    justOne: true
});

variantSchema.set("toObject", { virtuals: true, id: false });
variantSchema.set("toJSON", { virtuals: true, id: false });

const variantModel = mongoose.model("variant", variantSchema);
export default variantModel;
