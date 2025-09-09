import mongoose from "mongoose";

const galleryImage = new mongoose.Schema({
    gImage: { type: String, default: null },
    gImageKey: { type: String, default: null }
});

// For different pack sizes
const packSizeSchema = new mongoose.Schema({
    weight: { type: Number, required: true },        // 250, 350, 500
    unit: {
        type: String,
        enum: ["g", "kg", "ml", "l", "pc"],
        required: true
    },
    price: { type: Number, required: true, min: 0 }, // Price for this pack
    stock: { type: Number, default: 0, min: 0 }      // Available units of this pack
});

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
    // Base product pricing (optional, can be used as reference)
    price: { type: Number, default: null },
    originalPrice: { type: Number, default: null },
    discount: { type: Number, default: null },

    // Admin-side: total stock with unit
    totalQuantity: {
        value: { type: Number, required: true, min: 0 }, // e.g., 5
        unit: {
            type: String,
            enum: ["g", "kg", "ml", "l", "pc"],
            required: true
        }
    },

    // User-side: available pack sizes
    packSizes: [packSizeSchema],

    productDesc: { type: String, default: null },

    productImage: { type: String, default: null },
    productImageKey: { type: String, default: null },
    gImage: [galleryImage],

    productHealthBenefit: { type: String, default: null },
    productStorage: { type: String, default: null }
}, { timestamps: true });

const productModel = mongoose.model("product", productSchema);

export default productModel;



// add product json formate
// {
//   "productName": "Organic Rice",
//   "category": "66e24b93e79b21c75b5d4a12",
//   "totalQuantity": { "value": 5, "unit": "kg" },
//   "packSizes": [
//     { "weight": 250, "unit": "g", "price": 40, "stock": 50 },
//     { "weight": 350, "unit": "g", "price": 55, "stock": 30 },
//     { "weight": 500, "unit": "g", "price": 70, "stock": 20 }
//   ],
//   "productDesc": "Premium organic rice.",
//   "productImage": "https://s3.aws.com/cover.jpg",
//   "gImage": [
//     { "gImage": "https://s3.aws.com/gallery1.jpg" },
//     { "gImage": "https://s3.aws.com/gallery2.jpg" }
//   ],
//   "productHealthBenefit": "Rich in fiber.",
//   "productStorage": "Keep in a dry place"
// }
