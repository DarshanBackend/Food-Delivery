import mongoose from "mongoose"

const productVarientSchema = mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "product"
    },
    product_image: {
        type: String,
        default: null
    },
    product_gallery_image: [
        { type: String, default: null }
    ],
    unit: {
        type: String,
        enum: ["KG", "Gram", "Piece"]
    },
    quantity: {
        type: Number,
        defult: 0
    },
    price: {
        type: Number
    },
    discount: [],
    productDesc: {
        type: String
    },
    Healthbenift: {
        type: String
    },
    storage_Uses: {
        type: String
    },
    isAvaible: {
        type: Boolen
    }
}, { timestamps: true })

const DiscountSchem = new mongoose.Schema({
    
})

export default mongoose.model("productVarient", productVarientSchema);
