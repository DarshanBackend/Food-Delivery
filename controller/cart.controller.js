import mongoose from "mongoose";
import cartModel from "../model/cart.model.js";
import productModel from "../model/product.model.js";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendResponse, sendSuccessResponse } from "../utils/Response.utils.js";


//addToCart Controller
export const addToCartController = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { productId } = req.params;
        const { packSizeId, quantity } = req.body;

        // === Validation ===
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendErrorResponse(res, 400, "Invalid product ID");
        }
        if (!mongoose.Types.ObjectId.isValid(packSizeId)) {
            return sendErrorResponse(res, 400, "Invalid packSize ID");
        }
        if (!quantity || quantity < 1) {
            return sendErrorResponse(res, 400, "Quantity must be at least 1");
        }

        // === Product check ===
        const product = await productModel.findById(productId);
        if (!product) return sendErrorResponse(res, 404, "Product not found");

        // === Pack size check ===
        const pack = product.packSizes.find(
            (p) => p._id.toString() === packSizeId.toString()
        );
        if (!pack) return sendErrorResponse(res, 400, "Invalid pack size");

        // === Cart check ===
        let cart = await cartModel.findOne({ userId: userId });
        if (!cart) cart = new cartModel({ userId, items: [] });
        cart.appliedCoupon = undefined;

        // === Existing item check ===
        const existingItem = cart.items.find((item) => {
            const prodId =
                item.productId && item.productId._id
                    ? item.productId._id.toString()
                    : item.productId?.toString();

            const packId = item.packSizeId ? item.packSizeId.toString() : null;

            return prodId === productId && packId === packSizeId;
        });

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.items.push({
                productId: new mongoose.Types.ObjectId(productId),
                packSizeId: new mongoose.Types.ObjectId(packSizeId),
                quantity: Number(quantity),
            });

        }

        await cart.save();
        await cart.populate("items.productId", "productName packSizes");

        // === Calculate total safely ===
        let totalAmount = 0;
        cart.items.forEach((item) => {
            if (item.productId?.packSizes) {
                const selectedPack = item.productId.packSizes.find(
                    (p) => p._id.toString() === item.packSizeId.toString()
                );
                if (selectedPack) {
                    totalAmount += selectedPack.price * item.quantity;
                }
            }
        });

        return sendSuccessResponse(res, 200, "Added to cart", {
            items: cart.items,
            totalAmount,
        });
    } catch (err) {
        console.error("Add to cart error:", err);
        return sendErrorResponse(res, 500, "Error adding to cart", err.message);
    }
};

//get my cart with user , product , packSie ,qaunity info
export const getMyCartController = async (req, res) => {
    try {
        const { id: userId } = req?.user;

        // Validation
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "User ID not found or invalid!");
        }

        // Fetch cart with populated product info
        const cart = await cartModel.findOne({ userId })
            .populate("userId", "-password -__v")
            .populate({
                path: "items.productId",
                select: "-productHealthBenefit -productStorage -gImage"
            })
            .populate("items.packSizeId");

        if (!cart) {
            return sendNotFoundResponse(res, "User cart not found");
        }

        // Check if cart is empty
        if (cart.items.length === 0) {
            return sendResponse(res, 204, true, "Cart is empty! Please add products first.", cart);
        }

        // Filter packSizes to include only the selected packSize and calculate totalAmount
        let totalAmount = 0;
        const filteredItems = cart.items.map((item) => {
            const product = item.productId.toObject(); // Convert Mongoose doc to plain JS object

            if (product.packSizes && item.packSizeId) {
                // Keep only the packSize that matches item.packSizeId
                product.packSizes = product.packSizes.filter(
                    (p) => p._id.toString() === item.packSizeId.toString()
                );

                // Add to totalAmount
                if (product.packSizes.length > 0) {
                    totalAmount += product.packSizes[0].price * item.quantity;
                }
            }

            return {
                ...item.toObject(),
                productId: product
            };
        });

        // Return filtered cart with totalAmount
        return sendSuccessResponse(res, "My cart items fetched successfully", {
            ...cart.toObject(),
            items: filteredItems,
            totalAmount
        });

    } catch (error) {
        console.error(`Error during getMyCartController: ${error.message}`);
        return sendErrorResponse(res, 500, "Error fetching cart", error.message);
    }
};


//update cart
export const updateCartItemController = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { productId } = req.params;
        const { packSizeId, quantity } = req.body;

        // === Validation ===
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendErrorResponse(res, 400, "Invalid product ID");
        }
        if (!mongoose.Types.ObjectId.isValid(packSizeId)) {
            return sendErrorResponse(res, 400, "Invalid packSize ID");
        }
        if (!quantity || quantity < 1) {
            return sendErrorResponse(res, 400, "Quantity must be at least 1");
        }

        // === Find cart ===
        const cart = await cartModel.findOne({ userId });
        if (!cart) return sendErrorResponse(res, 404, "Cart not found");

        // === Find item ===
        const item = cart.items.find(
            (i) =>
                i.productId.toString() === productId &&
                i.packSizeId.toString() === packSizeId
        );
        if (!item) return sendErrorResponse(res, 404, "Item not found in cart");

        // === Update only quantity ===
        item.quantity = quantity;
        cart.appliedCoupon = undefined;

        await cart.save();
        await cart.populate("items.productId", "productName packSizes");

        // === Calculate total ===
        let totalAmount = 0;
        cart.items.forEach((item) => {
            if (item.productId?.packSizes) {
                const selectedPack = item.productId.packSizes.find(
                    (p) => p._id.toString() === item.packSizeId.toString()
                );
                if (selectedPack) {
                    totalAmount += selectedPack.price * item.quantity;
                }
            }
        });

        return sendSuccessResponse(res, 200, "Cart item quantity updated", {
            items: cart.items,
            totalAmount,
        });
    } catch (err) {
        console.error("Patch cart item error:", err);
        return sendErrorResponse(res, 500, "Error updating cart item quantity", err.message);
    }
};

// delete by id
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

// Billing Summary Controller
export const billingSummaryController = async (req, res) => {
    try {
        const { id: userId } = req.user;

        const cart = await cartModel.findOne({ userId }).populate("items.productId");
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

        let subtotal = 0;
        let itemsCount = 0;

        cart.items.forEach(item => {
            const product = item.productId;
            if (!product) return;

            const selectedPack = product.packSizes?.find(
                p => p._id.toString() === item.packSizeId.toString()
            );
            if (selectedPack) {
                subtotal += selectedPack.price * item.quantity;
                itemsCount += item.quantity;
            }
        });

        let discount = 0;
        if (cart.appliedCoupon) {
            discount = cart.appliedCoupon.discount || 0;
        }

        const platformFee = 1;
        const deliveryChargesOriginal = 20;
        const deliveryCharges = 20;
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
            appliedCoupon: cart.appliedCoupon || null
        });
    } catch (error) {
        console.error("billingSummaryController error:", error);
        return sendErrorResponse(res, 500, "Error fetching billing summary", error.message);
    }
};
