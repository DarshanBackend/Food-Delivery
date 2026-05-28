import mongoose from "mongoose";
import cartModel from "../model/cart.model.js";
import productModel from "../model/product.model.js";
import variantModel from "../model/variant.model.js";
import stockModel from "../model/stock.model.js";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import { getCurrencyRate, convertPrice } from "../utils/currency.utils.js";

export const addToCartController = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { productId } = req.params;
        const { variantId, quantity } = req.body;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendErrorResponse(res, 400, "Invalid product ID");
        }
        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendErrorResponse(res, 400, "Invalid variant ID");
        }
        if (!quantity || quantity < 1) {
            return sendErrorResponse(res, 400, "Quantity must be at least 1");
        }

        const product = await productModel.findById(productId);
        if (!product) return sendErrorResponse(res, 404, "Product not found");

        const variant = await variantModel.findOne({ _id: variantId, productId });
        if (!variant) return sendErrorResponse(res, 400, "Invalid variant");

        let cart = await cartModel.findOne({ userId });
        if (!cart) cart = new cartModel({ userId, items: [] });
        cart.appliedCoupon = undefined;

        const stock = await stockModel.findOne({ variantId });
        const availableQty = stock ? stock.quantity : 0;

        let requestedQty = Number(quantity);
        const existingItem = cart.items.find((item) => {
            const prodId = item.productId && item.productId._id ? item.productId._id.toString() : item.productId?.toString();
            const varId = item.variantId ? item.variantId.toString() : null;
            return prodId === productId && varId === variantId;
        });

        if (existingItem) {
            requestedQty += existingItem.quantity;
        }

        if (availableQty < requestedQty) {
            return sendErrorResponse(res, 400, `Only ${availableQty} items are in stock`);
        }

        if (existingItem) {
            existingItem.quantity += Number(quantity);
        } else {
            cart.items.push({
                productId: new mongoose.Types.ObjectId(productId),
                variantId: new mongoose.Types.ObjectId(variantId),
                quantity: Number(quantity),
            });
        }

        await cart.save();
        await cart.populate("items.productId", "productName");
        await cart.populate("items.variantId");

        const { rate, currency } = getCurrencyRate(req.user);
        let totalAmount = 0;
        const formattedItems = cart.items.map((item) => {
            const itemObj = item.toObject();
            if (itemObj.variantId) {
                itemObj.variantId.price = convertPrice(itemObj.variantId.price, rate);
                itemObj.variantId.originalPrice = convertPrice(itemObj.variantId.originalPrice, rate);
                itemObj.variantId.currency = currency;
                totalAmount += itemObj.variantId.price * item.quantity;
            }
            return itemObj;
        });

        return sendSuccessResponse(res, 200, "Added to cart", {
            items: formattedItems,
            totalAmount,
            currency
        });
    } catch (err) {
        console.error("Add to cart error:", err);
        return sendErrorResponse(res, 500, "Error adding to cart", err.message);
    }
};

export const getMyCartController = async (req, res) => {
    try {
        const { id: userId } = req?.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "User ID not found or invalid!");
        }

        const cart = await cartModel.findOne({ userId })
            .populate({
                path: "items.productId",
                select: "-productHealthBenefit -productStorage"
            })
            .populate({
                path: "items.variantId",
                populate: { path: "stock" }
            });

        if (!cart) {
            return sendNotFoundResponse(res, "User cart not found");
        }

        if (cart.items.length === 0) {
            return sendSuccessResponse(res, "Cart is empty! Please add products first.", cart);
        }

        const { rate, currency } = getCurrencyRate(req.user);
        let totalAmount = 0;
        const filteredItems = cart.items.map((item) => {
            const itemObj = item.toObject();
            if (itemObj.variantId) {
                itemObj.variantId.stock = itemObj.variantId.stock ? itemObj.variantId.stock.quantity : 0;
                itemObj.variantId.price = convertPrice(itemObj.variantId.price, rate);
                itemObj.variantId.originalPrice = convertPrice(itemObj.variantId.originalPrice, rate);
                itemObj.variantId.currency = currency;
                totalAmount += itemObj.variantId.price * item.quantity;
            }
            return itemObj;
        });

        return sendSuccessResponse(res, "My cart items fetched successfully", {
            ...cart.toObject(),
            items: filteredItems,
            totalAmount,
            currency
        });

    } catch (error) {
        console.error(`Error during getMyCartController: ${error.message}`);
        return sendErrorResponse(res, 500, "Error fetching cart", error.message);
    }
};

export const updateCartItemController = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { productId } = req.params;
        const { variantId, quantity } = req.body;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendErrorResponse(res, 400, "Invalid product ID");
        }
        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendErrorResponse(res, 400, "Invalid variant ID");
        }
        if (!quantity || quantity < 1) {
            return sendErrorResponse(res, 400, "Quantity must be at least 1");
        }

        const stock = await stockModel.findOne({ variantId });
        const availableQty = stock ? stock.quantity : 0;
        if (availableQty < Number(quantity)) {
            return sendErrorResponse(res, 400, `Only ${availableQty} items are in stock`);
        }

        const cart = await cartModel.findOne({ userId });
        if (!cart) return sendErrorResponse(res, 404, "Cart not found");

        const item = cart.items.find(
            (i) => i.productId.toString() === productId && i.variantId.toString() === variantId
        );
        if (!item) return sendErrorResponse(res, 404, "Item not found in cart");

        item.quantity = Number(quantity);
        cart.appliedCoupon = undefined;

        await cart.save();
        await cart.populate("items.productId", "productName");
        await cart.populate("items.variantId");

        const { rate, currency } = getCurrencyRate(req.user);
        let totalAmount = 0;
        const formattedItems = cart.items.map((item) => {
            const itemObj = item.toObject();
            if (itemObj.variantId) {
                itemObj.variantId.price = convertPrice(itemObj.variantId.price, rate);
                itemObj.variantId.originalPrice = convertPrice(itemObj.variantId.originalPrice, rate);
                itemObj.variantId.currency = currency;
                totalAmount += itemObj.variantId.price * item.quantity;
            }
            return itemObj;
        });

        return sendSuccessResponse(res, 200, "Cart item quantity updated", {
            items: formattedItems,
            totalAmount,
            currency
        });
    } catch (err) {
        console.error("Patch cart item error:", err);
        return sendErrorResponse(res, 500, "Error updating cart item quantity", err.message);
    }
};

export const deleteCartItemController = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { cartItemId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
            return sendErrorResponse(res, 400, "Invalid Cart Item ID");
        }

        const cart = await cartModel.findOne({ userId });
        if (!cart) {
            return sendErrorResponse(res, 404, "Cart not found");
        }

        const itemIndex = cart.items.findIndex(item => item._id.toString() === cartItemId);
        if (itemIndex === -1) {
            return sendErrorResponse(res, 404, "Item not found in cart");
        }

        cart.items.splice(itemIndex, 1);
        cart.appliedCoupon = undefined;

        await cart.save();
        return sendSuccessResponse(res, "Cart item deleted successfully", cart);
    } catch (error) {
        console.log("Error while deleting cart item: " + error.message);
        return sendErrorResponse(res, 500, "Error while deleting cart item");
    }
};

export const billingSummaryController = async (req, res) => {
    try {
        const { id: userId } = req.user;

        const cart = await cartModel.findOne({ userId }).populate("items.variantId");
        if (!cart || cart.items.length === 0) {
            return sendSuccessResponse(res, "Cart is empty. Returning zero billing summary.", {
                itemsCount: 0,
                subtotal: 0,
                discount: 0,
                platformFee: 0,
                deliveryCharges: 0,
                deliveryChargesOriginal: 0,
                isDeliveryFree: false,
                total: 0,
                appliedCoupon: null
            });
        }

        const { rate, currency } = getCurrencyRate(req.user);
        let subtotal = 0;
        let itemsCount = 0;

        cart.items.forEach(item => {
            if (item.variantId) {
                const price = convertPrice(item.variantId.price, rate);
                subtotal += price * item.quantity;
                itemsCount += item.quantity;
            }
        });

        let discount = 0;
        if (cart.appliedCoupon) {
            discount = convertPrice(cart.appliedCoupon.discount || 0, rate);
        }

        const platformFee = convertPrice(1, rate);
        const deliveryChargesOriginal = convertPrice(20, rate);
        const deliveryCharges = convertPrice(20, rate);
        const isDeliveryFree = false;

        const total = subtotal - discount + platformFee + deliveryCharges;

        return sendSuccessResponse(res, "Billing summary fetched successfully", {
            itemsCount,
            subtotal,
            discount,
            platformFee,
            deliveryCharges,
            deliveryChargesOriginal,
            isDeliveryFree,
            total,
            appliedCoupon: cart.appliedCoupon || null,
            currency
        });
    } catch (error) {
        console.error("billingSummaryController error:", error);
        return sendErrorResponse(res, 500, "Error fetching billing summary", error.message);
    }
};
