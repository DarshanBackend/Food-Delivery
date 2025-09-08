import mongoose from "mongoose"

const productVarientSchema = mongoose.Schema({
    product_name: {
        type: String,
        default: null
    },
    product_image: {
        type: String,
        default: null
    },
    product_gallery_image: [
        { type: String }
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
    discount: {
        "250g": "15%",
        "350g": "20%",
        "500g": "30%"
    },
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

export default mongoose.model("productVarient", productVarientSchema);
