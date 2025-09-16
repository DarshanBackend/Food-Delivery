import mongoose from "mongoose";
import { sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import orderModel from "../model/order.model.js";
import paymentModel from "../model/payment.model.js";
import cartModel from "../model/cart.model.js";
import PDFDocument from "pdfkit";

export const makeNewPaymentController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const {
            orderId,
            paymentMethod,
            transactionId,
            cardDetails,
            paypalDetails,
            bankTransferDetails,
        } = req.body;

        // Validate required fields
        if (!userId || !orderId || !paymentMethod) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Fetch order
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Use order.finalAmount as the payment amount
        const amount = order.finalAmount;

        // Create Payment record
        const payment = await paymentModel.create({
            userId,
            orderId,
            amount,
            paymentMethod,
            transactionId: transactionId || null, // from gateway if available
            cardDetails,
            paypalDetails,
            bankTransferDetails,
        });

        // === Remove ordered items from user's cart ===
        if (order.items && order.items.length > 0) {
            await cartModel.updateOne(
                { userId },
                {
                    $pull: {
                        items: {
                            $or: order.items.map((i) => ({
                                productId: i.productId,
                                packSizeId: i.packSizeId,
                            })),
                        },
                    },
                }
            );
        }

        return res.status(201).json({
            success: true,
            message: "Payment record created & ordered items removed from cart",
            data: payment,
        });
    } catch (error) {
        console.error("Payment Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
};


export const myPaymentController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        if (!userId) {
            return sendErrorResponse(res, 400, "User ID is required");
        }
        const payments = await paymentModel.find({ userId })
            .populate({
                path: "orderId",
                populate: [
                    {
                        path: "items.productId",
                        select: "productName price productImage"
                    },
                    {
                        path: "items.sellerId",
                        select: "storeName businessName email mobileNo pickUpAddr"
                    },
                    {
                        path: "items.packSizeId",
                        select: "weight unit price"
                    }
                ]
            });


        return sendSuccessResponse(res, "User payments fetched", payments);
    } catch (error) {
        return sendErrorResponse(res, 500, "Server error", error.message);
    }
}


export const getSellerPaymentsController = async (req, res) => {
    try {
        const sellerId = req.user.id; // logged-in seller
        if (!sellerId) {
            return res.status(400).json({ success: false, message: "Seller ID is required" });
        }

        // Fetch payments with nested order and items
        const payments = await paymentModel.find()
            .populate("userId", "name email mobileNo")
            .populate({
                path: "orderId",
                populate: [
                    { path: "items.productId", select: "productName price productImage" },
                    { path: "items.sellerId", select: "storeName businessName email mobileNo pickUpAddr" },
                    { path: "items.packSizeId", select: "sizeName quantity" },
                    { path: "deliveryAddress" }
                ]
            })
            .sort({ createdAt: -1 });

        // Filter payments for this seller only
        const sellerPayments = payments
            .map(payment => {
                // Filter items that belong to this seller
                const sellerItems = payment.orderId.items.filter(item =>
                    item.sellerId._id.toString() === sellerId
                );

                if (sellerItems.length === 0) return null; // skip payments with no items for this seller

                return {
                    ...payment.toObject(),
                    orderId: {
                        ...payment.orderId.toObject(),
                        items: sellerItems
                    }
                };
            })
            .filter(payment => payment !== null);

        return res.status(200).json({
            success: true,
            count: sellerPayments.length,
            data: sellerPayments
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


export const downloadInvoiceController = async (req, res) => {
    try {
        const { paymentId } = req.params;

        if (!paymentId || !mongoose.Types.ObjectId.isValid(paymentId)) {
            return res.status(400).json({
                success: false,
                message: "Valid payment ID is required"
            });
        }

        const payment = await paymentModel.findById(paymentId)
            .populate("userId", "name email mobileNo")
            .populate({
                path: "orderId",
                populate: [
                    { path: "items.productId", select: "productName price" },
                    { path: "items.sellerId", select: "storeName businessName email mobileNo pickUpAddr" },
                    { path: "items.packSizeId", select: "sizeName quantity" },
                    { path: "deliveryAddress" }
                ]
            });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Create a PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=invoice_${paymentId}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        doc.rect(50, 40, doc.page.width - 100, 40)
            .fill("#2E86C1");

        doc.fillColor("white")
            .fontSize(20)
            .text("Invoice", 50, 50, { align: "center" });

        // Reset color for next text
        doc.fillColor("black");

        // Invoice Header
        doc.fontSize(20).text("Invoice", { align: "center" });
        doc.moveDown();

        // Payment Info
        doc.fontSize(12).text(`Invoice ID: ${payment._id}`);
        doc.text(`Payment Method: ${payment.paymentMethod}`);
        doc.text(`Payment Status: ${payment.paymentStatus}`);
        doc.text(`Payment Date: ${payment.paymentDate.toDateString()}`);
        doc.moveDown();

        // User Info
        doc.text(`Customer Name: ${payment.userId.name}`);
        doc.text(`Email: ${payment.userId.email}`);
        doc.text(`Mobile: ${payment.userId.mobileNo}`);
        doc.moveDown();

        // Delivery Address
        const addr = payment.orderId.deliveryAddress;
        if (addr) {
            doc.text("Delivery Address:");
            doc.text(`${addr.firstName} ${addr.lastName}`);
            doc.text(`${addr.houseNo}, ${addr.landmark}`);
            doc.text(`${addr.city} - ${addr.pincode}, ${addr.state}, ${addr.country}`);
            doc.text(`Phone: ${addr.phone}`);
            doc.moveDown();
        }

        // Order Items
        doc.text("Order Items:");
        payment.orderId.items.forEach((item, index) => {
            const product = item.productId;
            const seller = item.sellerId;
            const pack = item.packSizeId;
            doc.text(`${index + 1}. ${product.productName} - ₹${product.price} x ${item.quantity}`);
            doc.text(`   Seller: ${seller.storeName} (${seller.businessName})`);
            doc.text(`   Pack: ${pack?.unit || "N/A"}`);
            doc.moveDown(0.5);
        });

        // Total Amount
        doc.moveDown();
        doc.fontSize(14).text(`Total Amount: ₹${payment.amount}`, { align: "right" });

        // Finalize PDF
        doc.end();

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};
