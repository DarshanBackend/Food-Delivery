import { config } from 'dotenv'; config();
import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendResponse, sendSuccessResponse } from '../utils/Response.utils.js';
import sellerModel from "../model/seller.model.js";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import jwt from 'jsonwebtoken';
import transporter from '../utils/Email.config.js'
import validateGSTIN from '../utils/gst.verify.config.js'
import axios from 'axios';
import { stat } from 'fs';
import { ThrowError } from '../utils/Error.utils.js';

//global config
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET


// new seller register & verify -otp send
export const newSellerController = async (req, res) => {
    try {
        const { mobileNo, email, password } = req.body;

        // Validate request
        if (!mobileNo || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "mobileNo, email & password are required!"
            });
        }

        // Check if already registered
        const existingSeller = await sellerModel.findOne({ mobileNo: mobileNo });
        if (existingSeller) {
            return res.status(409).json({
                success: false,
                message: "You are already registered as a seller"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);


        //generate random avatar image.
        function Ravatar(email) {
            try {
                const formattedName = email.trim().replace(/\s+/g, "+");

                const avatarUrl = `https://ui-avatars.com/api/?name=${formattedName}&background=random`;

                return avatarUrl;

            } catch (error) {
                console.error("Error generating avatar:", error);
                return null;
            }
        }
        const profileAvatar = Ravatar(email) || "";

        // Create new seller
        const newSeller = await sellerModel.create({
            email,
            mobileNo,
            avatar: profileAvatar,
            password: hashedPassword,
        });

        // Send OTP via Twilio
        try {
            const verification = await client.verify.v2
                .services(process.env.TWILIO_VERIFY_SID)
                .verifications.create({
                    to: `+91${mobileNo}`,
                    channel: "sms",
                });

            return res.status(201).json({
                success: true,
                message: "Seller registered successfully & OTP sent!",
                verificationSid: verification.sid,
                seller: {
                    id: newSeller._id,
                    mobileNo: newSeller.mobileNo,
                    email: newSeller.email,
                    avatar: newSeller.avatar
                },
            });
        } catch (twilioError) {
            console.error("Twilio OTP Error:", twilioError.message);
            return res.status(201).json({
                success: true,
                message: "Seller registered successfully but OTP sending failed.",
                seller: {
                    id: newSeller._id,
                    mobileNo: newSeller.mobileNo,
                    email: newSeller.email,
                },
            });
        }
    } catch (error) {
        console.error("Registration Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error registering new seller",
            error: error.message,
        });
    }
};

export const getAllSeller = async (req, res) => {
    try {
        const sellerData = await sellerModel.find({})

        if (!sellerData || sellerData.length == 0) {
            return sendNotFoundResponse(res, "Seller not found!!!")
        }

        return sendSuccessResponse(res, "Seller fetched Successfully...", sellerData)

    } catch (error) {
        console.error("Seller fetch Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error fetching new seller",
            error: error.message,
        });
    }
}

export const getSeller = async (req, res) => {
    try {
        const { id } = req.user;

        // Exclude sensitive fields
        const seller = await sellerModel.findById(id).select("-password -tokens");
        if (!seller) {
            return sendNotFoundResponse(res, "Seller not found");
        }

        return sendSuccessResponse(res, "Seller profile fetched successfully", seller);

    } catch (error) {
        console.error("Seller fetch Error:", error.message);
        return ThrowError(res, 500, error.message);
    }
};

//verify mobile otp while register
export const verifySellerMobileOtpController = async (req, res) => {
    const COMMON_OTP = "000000";

    try {
        const { mobileNo, otp } = req.body;

        // Validate input
        if (!mobileNo && !otp) {
            return res.status(400).json({
                success: false,
                message: "Mobile number & OTP are required! to request"
            });
        }

        // Check if seller exists
        const seller = await sellerModel.findOne({ mobileNo: mobileNo });
        if (seller) {
            const payload = {
                id: seller._id,
                name: seller.name,
                email: seller.email,
                mobileNo: seller.mobileNo,
                isSeller: true
            };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

            return res.status(200).json({
                success: true,
                message: "seller verified Successfull also, login successful",
                seller: seller,
                token: token
            });
        }

        // Twilio OTP verification
        try {
            const verificationCheck = await client.verify.v2
                .services(process.env.TWILIO_VERIFY_SID)
                .verificationChecks.create({
                    to: `+91${mobileNo}`,
                    code: otp
                });

            console.log("Twilio Verification Status:", verificationCheck.status);

            if (verificationCheck.status === "approved") {
                seller.verified = true;
                await seller.save();

                return res.status(200).json({
                    success: true,
                    message: "OTP verified successfully (via Twilio)",
                    mobileNo: seller.mobileNo
                });
            }
        } catch (twilioError) {
            console.warn("Twilio Verification Failed:", twilioError.message);
        }

        // common OTP checking
        if (otp === COMMON_OTP) {
            seller.verified = true;
            await seller.save();

            return res.status(200).json({
                success: true,
                message: "OTP verified successfully (via COMMON_OTP)",
                mobileNo: seller.mobileNo
            });
        }

        // If both failed → invalid OTP
        return res.status(400).json({
            success: false,
            message: "Invalid OTP"
        });

    } catch (error) {
        console.error("OTP Verification Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error while verifying OTP",
            error: error.message
        });
    }
}

//login 
export const sellerLoginController = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required! to request"
            });
        }

        const seller = await sellerModel.findOne({ email });
        if (!seller) {
            return res.status(404).json({
                success: false,
                message: "You are not registered, please sign up first 🙏"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, seller.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid password!"
            });
        }

        const payload = {
            id: seller._id,
            name: seller.name,
            email: seller.email,
            mobileNo: seller.mobileNo,
            isSeller: true
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

        return res.status(200).json({
            success: true,
            message: "Login successfull",
            seller: {
                id: seller._id,
                name: seller.name,
                email: seller.email,
                role: seller.role
            },
            token
        });

    } catch (error) {
        console.error("Login Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error while logging in",
            error: error.message
        });
    }
}

const otpMap = new Map();

export const sellerForgetPasswordController = async (req, res) => {
    try {
        const { email } = req.body;

        // Validate input
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required!"
            });
        }

        // Find seller
        const seller = await sellerModel.findOne({ email });
        if (!seller) {
            return res.status(404).json({
                success: false,
                message: "seller not found, please register first!"
            });
        }

        // Generate OTP
        const OTP = Math.floor(100000 + Math.random() * 900000).toString();
        const from_email = process.env.SMTP_EMAIL || "hit.kalathiyainfotech@gmail.com";

        // Save OTP in DB with expiry
        seller.otp = OTP;
        await seller.save();

        // Also store OTP in memory (fast lookup, optional)
        otpMap.set(email, {
            OTP,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        // Send email
        await transporter.sendMail({
            from: from_email,
            to: email,
            subject: "🔐 OTP for Password Reset Fastcart-seller - FastCart",
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #f4f6f8;">
                    <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 12px; padding: 28px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); border: 1px solid #eaeaea;">
                        
                        <!-- Header -->
                        <h2 style="color: #2c3e50; text-align: center; margin-bottom: 10px; font-size: 22px;">
                            🔐 FastCart Password Reset
                        </h2>
                        <hr style="border: none; height: 1px; background: #ececec; margin: 15px 0;">
                        
                        <!-- Greeting -->
                        <p style="font-size: 15px; color: #2c3e50; margin: 12px 0;">
                            Hello <b>${seller.name || "Seller"}</b>,
                        </p>
                        
                        <!-- Message -->
                        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 12px 0;">
                            We received a request to reset your <b>FastCart</b> account password.<br>
                            Please use the OTP below to continue with resetting your password:
                        </p>
                        
                        <!-- OTP Box -->
                        <div style="text-align: center; margin: 28px 0;">
                            <p style="display: inline-block; background: #eaf6ff; color: #e74c3c; font-size: 26px; font-weight: bold; letter-spacing: 4px; padding: 12px 20px; border-radius: 8px; border: 1px dashed #3498db;">
                            ${OTP}
                            </p>
                        </div>
                        
                        <!-- Expiry Info -->
                        <p style="font-size: 14px; color: #777; line-height: 1.5; margin: 12px 0;">
                            ⚠️ This OTP will expire in <b>10 minutes</b>. If you didn’t request a password reset, you can safely ignore this email.
                        </p>
                        
                        <!-- Footer -->
                        <p style="font-size: 14px; color: #444; text-align: center; margin-top: 25px;">
                            – The <b style="color:#2c3e50;">FastCart Team</b>
                        </p>
                    </div>
                </div>
            `
        });

        return res.status(200).json({
            success: true,
            message: "Forgot password OTP sent successfully!",
            toEmail: email,
            otp: OTP // ⚠️ For testing only, remove in production
        });

    } catch (error) {
        console.error("Forgot Password OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error while sending forgot password OTP!",
            error: error.message
        });
    }
}

export const sellerVerifyForgetOtpController = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email & OTP are required!"
            });
        }

        // Find seller in DB
        const seller = await sellerModel.findOne({ email });
        if (!seller) {
            return res.status(404).json({
                success: false,
                message: "Seller not found!"
            });
        }

        // --- Case 1: Check OTP stored in DB ---
        if (seller.otp && seller.otp === otp) {
            // Clear OTP after successful verification
            seller.otp = null;
            await seller.save();

            return res.status(200).json({
                success: true,
                message: "OTP verified successfully! You can now reset your password."
            });
        }

        // --- Case 2: Check OTP in memory (testing fallback) ---
        const otpEntry = otpMap.get(email);
        if (otpEntry && otpEntry.expiresAt > Date.now()) {
            if (otpEntry.OTP === otp) {
                otpMap.delete(email);

                return res.status(200).json({
                    success: true,
                    message: "OTP verified successfully! You can now reset your password."
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid OTP!"
                });
            }
        }

        // --- If neither matched ---
        return res.status(400).json({
            success: false,
            message: "Invalid or expired OTP. Please request a new one."
        });

    } catch (error) {
        console.error("Verify Forgot OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error while verifying OTP!",
            error: error.message
        });
    }
};

export const sellerPasswordResetController = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        //Validate input
        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email & new password are required!"
            });
        }

        //Find user
        const user = await sellerModel.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found!"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10); // 10 salt rounds

        user.password = hashedPassword;
        user.otp = null;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successfully! You can now login with your new password."
        });

    } catch (error) {
        console.error("Reset Password Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error while resetting password!",
            error: error.message
        });
    }
}

//seller.kyc.controller
export const sellerGstVerifyAndInsertController = async (req, res) => {
    try {
        // Ensure user exists
        if (!req?.user || !req?.user?.mobileNo) {
            return sendNotFoundResponse(res, "User not found! OPPS!");
        }

        const { mobileNo } = req.user; // take mobileNo from logged-in user
        const { gstin } = req.body;

        if (!gstin) {
            return sendNotFoundResponse(res, "GSTIN is required!");
        }

        // GSTIN format check
        function isValidGSTIN(gstin) {
            const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
            return gstRegex.test(gstin);
        }

        if (!isValidGSTIN(gstin)) {
            return sendNotFoundResponse(res, "❌ Invalid GSTIN format!");
        }

        // Verify GSTIN (your utility function)
        const isGSTIN = await validateGSTIN(gstin);

        if (!isGSTIN?.valid) {
            return sendNotFoundResponse(res, "GSTIN verification failed!");
        }

        // Update seller record
        await sellerModel.updateOne(
            { mobileNo: mobileNo },
            { $set: { GSTIN: gstin, verified: true } }
        );

        return sendSuccessResponse(
            res,
            "✅ GSTIN is valid & saved successfully",
            { isGSTIN, mobileNo }
        );

    } catch (error) {
        console.error("GST Verification Error:", JSON.stringify(error, null, 2));
        return sendErrorResponse(res, 500, "Something went wrong during GST verification!", error);

    }
};

export const setSellerBusinessAddressController = async (req, res) => {
    try {
        const { businessName, panNumber, businessType, businessAddr } = req.body;
        const { id } = req?.user;

        if (!req?.user || !req?.user?.id) {
            return sendNotFoundResponse(res, "request user not found or thire id no Found!")
        }

        if (!businessName || !panNumber || !businessType || !businessAddr) {
            return sendBadRequestResponse(res, "businessName , panNumber, businessType & businessAddr are require to Insert!");
        }

        //verify Pan Number formate
        function isValidPAN(panNo) {
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

            return panRegex.test(panNo.toUpperCase());
        }

        if (!isValidPAN(panNumber)) {
            return sendResponse(res, 400, false, "this Not a Vaild Pancard Formate");
        }

        const seller = await sellerModel.findOne({ _id: id });
        if (!seller) {
            return sendNotFoundResponse(res, "seller Not Found")
        }

        //insert details
        const newBusinessLocation = await sellerModel.findByIdAndUpdate({ _id: id }, {
            businessName: businessName,
            panNumber: panNumber,
            businessType: businessType,
            businessAddr: businessAddr
        })
        await newBusinessLocation.save();

        try {
            // Generate 6-digit OTP
            const OTP = Math.floor(100000 + Math.random() * 900000).toString();
            const from_email = process.env.SMTP_EMAIL || "hit.kalathiyainfotech@gmail.com";

            // Save OTP in DB with expiry
            seller.otp = OTP;
            seller.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
            await seller.save();

            // (Optional) Also store OTP in memory for faster lookup
            otpMap.set(seller.email, {
                OTP,
                expiresAt: Date.now() + 10 * 60 * 1000
            });

            // Send email
            await transporter.sendMail({
                from: from_email,
                to: seller.email,
                subject: "🔐 GST Verification OTP - FastCart Seller",
                html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #f4f6f8;">
              <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 12px; padding: 28px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); border: 1px solid #eaeaea;">
                  
                  <!-- Header -->
                  <h2 style="color: #2c3e50; text-align: center; margin-bottom: 10px; font-size: 22px;">
                      ✅ GST Verification Required
                  </h2>
                  <hr style="border: none; height: 1px; background: #ececec; margin: 15px 0;">
                  
                  <!-- Greeting -->
                  <p style="font-size: 15px; color: #2c3e50; margin: 12px 0;">
                      Hello <b>${seller.name || seller.email || "Seller"}</b>,
                  </p>
                  
                  <!-- Message -->
                  <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 12px 0;">
                      To complete your <b>GST verification</b> for your FastCart seller account, please use the OTP below:
                  </p>
                  
                  <!-- OTP Box -->
                  <div style="text-align: center; margin: 28px 0;">
                      <p style="display: inline-block; background: #fef9e7; color: #d35400; font-size: 26px; font-weight: bold; letter-spacing: 4px; padding: 12px 20px; border-radius: 8px; border: 1px dashed #f39c12;">
                          ${OTP}
                      </p>
                  </div>
                  
                  <!-- Expiry Info -->
                  <p style="font-size: 14px; color: #777; line-height: 1.5; margin: 12px 0;">
                      ⚠️ This OTP is valid for <b>10 minutes</b>. Please do not share this code with anyone.  
                      If you did not request GST verification, you can ignore this email.
                  </p>
                  
                  <!-- Footer -->
                  <p style="font-size: 14px; color: #444; text-align: center; margin-top: 25px;">
                      – The <b style="color:#2c3e50;">FastCart Team</b>
                  </p>
              </div>
            </div>
        `
            });

            // ✅ Correct response message
            return sendSuccessResponse(res,
                "GST Verification OTP sent && Business Info saved successfully!",
                {
                    otp: OTP,
                    email: seller.email,
                    businessInfo: {
                        businessName: newBusinessLocation.businessName,
                        panNumber: newBusinessLocation.panNumber
                    }
                }
            );

        } catch (error) {
            console.error("Error while sending GST Verification OTP:", error);
            return sendErrorResponse(res, "Something went wrong while sending OTP. Please try again.");
        }

    } catch (error) {
        console.log("error while Seller Business Add " + error.message);
        return sendErrorResponse(res, 500, "Something Went Wrong Durning Busineness Address add!", error);
    }
}

export const verifySellerOtpController = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return sendBadRequestResponse(res, "Email and OTP are required!");
        }

        // 🔎 Find seller
        const seller = await sellerModel.findOne({ email });
        if (!seller) {
            return sendNotFoundResponse(res, "Seller not found!");
        }

        // 🔐 Check OTP exist
        if (!seller.otp) {
            return sendBadRequestResponse(res, "No OTP found for this seller. Please request again!");
        }

        // Match check
        if (otp !== seller.otp) {
            return sendBadRequestResponse(res, "Invalid OTP. Please try again!");
        }

        // ✅ OTP Verified → clear field
        seller.otp = null;
        seller.isVerified = true; // optional flag
        await seller.save();

        return sendSuccessResponse(res, "✅ OTP Verified Successfully!", {
            email: seller.email,
            businessName: seller.businessName,
            panNumber: seller.panNumber,
            verified: true
        });

    } catch (error) {
        console.error("Error verifying seller OTP:", error.message);
        return sendErrorResponse(res, 500, "Something went wrong while verifying OTP!", error.message);
    }
};

export const sellerGstResetOtpController = async (req, res) => {
    try {
        const { id } = req?.user; // or req.body.id depending on your route
        if (!id) {
            return sendNotFoundResponse(res, "req.user Id Not found !!")
        }
        const seller = await sellerModel.findById(id);

        if (!seller) {
            return sendNotFoundResponse(res, "Seller not found!");
        }

        // Generate 6-digit OTP
        const OTP = Math.floor(100000 + Math.random() * 900000).toString();
        const from_email = process.env.SMTP_EMAIL || "hit.kalathiyainfotech@gmail.com";

        // Save OTP in DB with expiry
        seller.otp = OTP;
        seller.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
        await seller.save();

        // (Optional) Also store OTP in memory for faster lookup
        otpMap.set(seller.email, {
            OTP,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        // Send email
        await transporter.sendMail({
            from: from_email,
            to: seller.email,
            subject: "🔐 GST Verification OTP - FastCart Seller",
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #f4f6f8;">
                  <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 12px; padding: 28px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); border: 1px solid #eaeaea;">
                      
                      <!-- Header -->
                      <h2 style="color: #2c3e50; text-align: center; margin-bottom: 10px; font-size: 22px;">
                          ✅ GST Verification Required
                      </h2>
                      <hr style="border: none; height: 1px; background: #ececec; margin: 15px 0;">
                      
                      <!-- Greeting -->
                      <p style="font-size: 15px; color: #2c3e50; margin: 12px 0;">
                          Hello <b>${seller.name || seller.email || "Seller"}</b>,
                      </p>
                      
                      <!-- Message -->
                      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 12px 0;">
                          To complete your <b>GST verification</b> for your FastCart seller account, please use the OTP below:
                      </p>
                      
                      <!-- OTP Box -->
                      <div style="text-align: center; margin: 28px 0;">
                          <p style="display: inline-block; background: #fef9e7; color: #d35400; font-size: 26px; font-weight: bold; letter-spacing: 4px; padding: 12px 20px; border-radius: 8px; border: 1px dashed #f39c12;">
                              ${OTP}
                          </p>
                      </div>
                      
                      <!-- Expiry Info -->
                      <p style="font-size: 14px; color: #777; line-height: 1.5; margin: 12px 0;">
                          ⚠️ This OTP is valid for <b>10 minutes</b>. Please do not share this code with anyone.  
                          If you did not request GST verification, you can ignore this email.
                      </p>
                      
                      <!-- Footer -->
                      <p style="font-size: 14px; color: #444; text-align: center; margin-top: 25px;">
                          – The <b style="color:#2c3e50;">FastCart Team</b>
                      </p>
                  </div>
                </div>
            `
        });

        // ✅ Success response
        return sendSuccessResponse(res, "GST Verification OTP resent successfully!", {
            otp: OTP,
            email: seller.email
        });

    } catch (error) {
        console.error("Error during GST OTP resend:", error);
        return sendErrorResponse(res, "Something went wrong while resending GST verification OTP.");
    }
};

//seller.brand.info.controller.js
export const sellerBrandInfoAddController = async (req, res) => {
    try {
        const { id } = req?.user;
        const { storeName, ownerName } = req?.body;

        if (!storeName && !ownerName && !req.body) {
            return sendBadRequestResponse("storeName & ownerName are required! to request!");
        }

        if (!id && req?.user) {
            return sendNotFoundResponse(res, "req.user & user id no Found!!");
        }

        const seller = await sellerModel.findOne({ _id: id });

        if (!seller) {
            return sendNotFoundResponse(res, "Seller not found!");
        }

        //save record
        const newBrandinfo = await sellerModel.findByIdAndUpdate({ _id: id }, {
            storeName: storeName,
            ownerName: ownerName
        });

        await newBrandinfo.save();

        return sendSuccessResponse(res, "Branch Name & owner Name Save Successfully", newBrandinfo);

    } catch (error) {
        console.log("error while Insert Seller Brand info" + error.message);
        return sendErrorResponse(res, 500, "Error while insert Seller Brand Info", error);
    }
}

export const sellerBankInfoSetController = async (req, res) => {
    try {
        const { id } = req?.user || {};

        if (!id) {
            return sendNotFoundResponse(res, "User ID not found in request!");
        }

        const { BankAcNumber, ifsc } = req?.body || {};

        if (!BankAcNumber || !ifsc) {
            return sendNotFoundResponse(res, "BankAcNumber & ifsc are required!");
        }

        // ✅ Verify IFSC Code
        try {
            const ifsc_verify_base_url = "https://ifsc.razorpay.com";
            const { data: ifscData } = await axios.get(
                `${ifsc_verify_base_url}/${String(ifsc).toUpperCase()}`
            );

            if (!ifscData) {
                return sendErrorResponse(res, 404, `${ifsc} is not a valid IFSC code!`);
            }
        } catch (err) {
            return sendErrorResponse(res, 400, `Invalid IFSC code: ${ifsc}`);
        }

        // ✅ Verify Bank Account Number
        const verifyAccountNumber = (accNo) => /^\d{9,18}$/.test(String(accNo).trim());
        const isValidBankNumber = verifyAccountNumber(BankAcNumber);

        if (!isValidBankNumber) {
            return sendErrorResponse(
                res,
                400,
                "Invalid Bank Account Number! Must be 9–18 digits."
            );
        }

        // ✅ Update Seller Bank Info
        const sellerBank = await sellerModel.findByIdAndUpdate(
            { _id: id },
            { BankAcNumber, ifsc: String(ifsc).toUpperCase() },
            { new: true }
        );

        if (!sellerBank) {
            return sendNotFoundResponse(res, "Seller not found!");
        }

        return sendSuccessResponse(res, "Seller bank info updated successfully!", sellerBank);
    } catch (error) {
        console.error("Error in sellerBankInfoSetController:", error.message);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

export const sellerPickUpAddressSetController = async (req, res) => {
    try {
        const { houseNo, street, landmark, pincode, city, state } = req.body;
        const { id } = req?.user || {};

        // Validate user
        if (!id) {
            return sendBadRequestResponse(res, "User not found in request!");
        }

        // Validate address fields
        if (![houseNo, street, landmark, pincode, city, state].every(field => field && field.toString().trim() !== "")) {
            return sendBadRequestResponse(
                res,
                "houseNo, street, landmark, pincode, city & state are required!"
            );
        }

        // Save pickup address
        const SellerPickUpAddr = await sellerModel.findByIdAndUpdate(
            { _id: id },
            {
                $push: {
                    pickUpAddr: { houseNo, street, landmark, pincode, city, state }
                }
            },
            { new: true, runValidators: true }
        );

        if (!SellerPickUpAddr) {
            return sendNotFoundResponse(res, "Seller not found!");
        }

        return sendSuccessResponse(
            res,
            "Pick-up address inserted successfully!",
            { pickUpAddr: SellerPickUpAddr.pickUpAddr }
        );

    } catch (error) {
        console.error("Error while adding PickUp Address:", error);
        return sendErrorResponse(res, "Error while inserting pick-up address!");
    }
};

export const trueSellerAgreementController = async (req, res) => {
    try {
        const { id } = req?.user || {};

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid or missing user ID");
        }

        const accept = await sellerModel.findByIdAndUpdate(
            { _id: id },
            { isSellerAgreementAccept: true },
            { new: true }
        );

        if (!accept) {
            return sendNotFoundResponse(res, "Seller not found");
        }

        return sendSuccessResponse(
            res,
            200,
            `Congratulations, welcome ${accept.email}. Now you are a seller of FastCart.`,
            accept
        );

    } catch (error) {
        console.error("Error while setting Seller Agreement:", error.message);
        return sendErrorResponse(res, 500, "Something went wrong while accepting agreement");
    }
};
