import stockModel from "../model/stock.model.js";
import variantModel from "../model/variant.model.js";

export const checkStockAvailability = async (items) => {
    for (const item of items) {
        const variantId = item.variantId.toString();
        const qtyNeeded = item.quantity;

        const variant = await variantModel.findById(variantId).populate("productId");
        if (!variant) {
            return { isValid: false, message: `Variant not found: ${variantId}` };
        }

        const stock = await stockModel.findOne({ variantId });
        const availableQty = stock ? stock.quantity : 0;

        if (availableQty < qtyNeeded) {
            return {
                isValid: false,
                message: `Insufficient stock for product "${variant.productId?.productName || "Unknown"}" variant (${variant.weight} ${variant.unit}). Available: ${availableQty}, Requested: ${qtyNeeded}`
            };
        }
    }
    return { isValid: true };
};

export const updateStock = async (items, direction) => {
    for (const item of items) {
        const variantId = item.variantId.toString();
        const qty = item.quantity;

        const stock = await stockModel.findOne({ variantId });
        if (stock) {
            stock.quantity += direction * qty;
            if (stock.quantity < 0) stock.quantity = 0;
            await stock.save();
        }
    }
};
