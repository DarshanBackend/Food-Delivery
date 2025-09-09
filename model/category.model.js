import mongoose from "mongoose"

const categorySchema = new mongoose.Schema({
    category_name: {
        type: String,
        default: null
    },
    category_image: {
        type: String,
        default: null
    },
    category_image_key: {
        type: String,
        default: null
    }
}, { timestamps: true })

const CategoryModel = mongoose.model("category", categorySchema);

export default CategoryModel;
