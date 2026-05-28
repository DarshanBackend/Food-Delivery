import mongoose from "mongoose";

const galleryImage = new mongoose.Schema({
    gImage: { type: String, default: null },
    gImageKey: { type: String, default: null }
});


const packSizeSchema = new mongoose.Schema({
    weight: { type: Number, required: true },        
    unit: {
        type: String,
        enum: ["g", "kg", "ml", "l", "pc"],
        required: true
    },
    price: { type: Number, required: true, min: 0 }, 
    stock: { type: Number, default: 0, min: 0 }      
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
    inStock: { type: Boolean, default: true }, 
    
    price: { type: Number, default: null },
    originalPrice: { type: Number, default: null },
    discount: { type: Number, default: null },

    
    totalQuantity: {
        value: { type: Number, required: true, min: 0 }, 
        unit: {
            type: String,
            enum: ["g", "kg", "ml", "l", "pc"],
            required: true
        }
    },
    soldCount: { type: Number, default: 0 },
    
    packSizes: [packSizeSchema],
    currency: {
        type: String,
        enum: ["USD", "INR", "AED", "NZD"],
        default: "USD"
    },
    productDesc: { type: String, default: null },

    productImage: { type: String, default: null },
    productImageKey: { type: String, default: null },
    gImage: [galleryImage],

    productHealthBenefit: { type: String, default: null },
    productStorage: { type: String, default: null }
}, { timestamps: true });


productSchema.pre("save", function (next) {
    if (this.totalQuantity && this.totalQuantity.value !== undefined) {
        this.inStock = this.totalQuantity.value > 0;
    }
    next();
});

const productModel = mongoose.model("product", productSchema);

export default productModel;






















