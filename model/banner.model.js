import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Banner title is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        image: {
            type: String,
            required: [true, "Banner image is required"],
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "category",
            required: [true, "Category reference ID is required"],
        },
    },
    {
        timestamps: true,
    }
);

const BannerModel = mongoose.model("banner", bannerSchema);

export default BannerModel;
