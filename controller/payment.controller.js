import mongoose from "mongoose";
import PaymentModel from "../model/payment.model.js";
import { ThrowError } from "../utils/Error.utils.js";
import { sendBadRequestResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import ProductModel from "../model/product.model.js";
import UserModel from "../model/user.model.js";

export const createPayment = async (req, res) => {
    try {
        const { transactionId, productId } = req.body
        const userId = req.user.id

        if (!transactionId || !productId) {
            return sendBadRequestResponse(res, "TranscationId & productId are Required!!!")
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Invalid productId")
        }

        const checkProduct = await ProductModel.findById(productId)
        if (!checkProduct) {
            return sendNotFoundResponse(res, "Product Not found!!!")
        }

        const addPayment = await PaymentModel.create({
            transactionId,
            productId,
            userId: userId
        })

        return sendSuccessResponse(res, "Payment add Successfully...", addPayment)
    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const getAllPayment = async (req, res) => {
    try {
        const payment = await PaymentModel.find()

        if (!payment || payment.length === 0) {
            return sendBadRequestResponse(res, "Payment Details not found")
        }

        return sendSuccessResponse(res, "Payment fetched Successfully...", payment)

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const getPaymentById = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid PaymentId")
        }

        const checkPayment = await PaymentModel.findById(id)
        if (!checkPayment) {
            return sendNotFoundResponse(res, "No any Payment found...")
        }

        return sendSuccessResponse(res, "Payment fetched Successfully...", checkPayment)

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const getUserPayment = async (req, res) => {
    try {
        console.log("req.user:", req.user); // 🐞 Debug log

        const userId = req.user.id || req.user._id || req.user.userId; // flexible
        if (!userId) {
            return sendBadRequestResponse(res, "UserId is missing from token!");
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return sendNotFoundResponse(res, "User not found!");
        }

        const checkPayment = await PaymentModel.findOne({ productId: user.productId });
        if (!checkPayment) {
            return sendNotFoundResponse(res, "No Payment found...");
        }

        return sendSuccessResponse(res, "Payment fetched Successfully...", checkPayment);

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const updatePayment = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid PaymentId")
        }

        const checkPayment = await PaymentModel.findById(id)
        if (!checkPayment) {
            return sendNotFoundResponse(res, "Payment not found")
        }

        const updatePayment = (req.body)
        const newPayment = await PaymentModel.findByIdAndUpdate(id, updatePayment, { new: true })

        return sendSuccessResponse(res, "Payment updated Successfully", newPayment)

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const deletePayment = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid PaymentId")
        }

        const checkPayment = await PaymentModel.findById(id)
        if (!checkPayment) {
            return sendNotFoundResponse(res, "Payment not found!!!")
        }

        await PaymentModel.findByIdAndDelete(id)

        return sendSuccessResponse(res, "Payment deleted Successfully...")

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}