import mongoose from "mongoose";
import dotenv from "dotenv";
import productModel from "../model/product.model.js";
import variantModel from "../model/variant.model.js";
import stockModel from "../model/stock.model.js";

// Load environment variables
dotenv.config();

const DB_URL = process.env.DB_URL || "mongodb+srv://akshayvaghasiya814:aksh2002@cluster0.se95gol.mongodb.net/fastcart";

async function runMigration() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(DB_URL);
        console.log("✅ Connected to Database.");

        const products = await productModel.find({}).lean();
        console.log(`Found ${products.length} products total in database.`);

        let migratedCount = 0;
        let skippedCount = 0;
        let variantCount = 0;
        let stockCount = 0;

        const validUnits = ["g", "kg", "ml", "l", "pc"];

        for (const product of products) {
            // Check if this product already has variants in the variant collection
            const existingVariantsCount = await variantModel.countDocuments({ productId: product._id });
            if (existingVariantsCount > 0) {
                console.log(`Product "${product.productName || 'Unnamed'}" (${product._id}) already has ${existingVariantsCount} variants. Skipping.`);
                skippedCount++;
                continue;
            }

            // Check if product has packSizes
            if (product.packSizes && product.packSizes.length > 0) {
                console.log(`Migrating "${product.productName || 'Unnamed'}" (${product._id}) with ${product.packSizes.length} packSizes.`);
                
                for (const size of product.packSizes) {
                    // Normalize the unit field to match variant schema validation
                    let unit = (size.unit || "pc").trim().toLowerCase();
                    if (unit === "pcs") unit = "pc";
                    if (!validUnits.includes(unit)) {
                        console.warn(`⚠️ Invalid unit "${size.unit}" found for product ${product._id}. Defaulting to "pc".`);
                        unit = "pc";
                    }

                    // Create variant document
                    const newVariant = await variantModel.create({
                        productId: product._id,
                        weight: Number(size.weight) || 0,
                        unit: unit,
                        price: Number(size.price) || 0,
                        originalPrice: Number(product.originalPrice || size.price || 0),
                        discount: Number(product.discount || 0),
                        variantImage: product.productImage || null,
                    });
                    variantCount++;

                    // Create stock document associated with this variant
                    await stockModel.create({
                        productId: product._id,
                        variantId: newVariant._id,
                        quantity: Number(size.stock || 0),
                    });
                    stockCount++;
                }
                migratedCount++;
            } else {
                console.log(`Product "${product.productName || 'Unnamed'}" (${product._id}) has no legacy packSizes. Skipping.`);
                skippedCount++;
            }
        }

        console.log("\n================ Migration Summary ================");
        console.log(`Total Products Scanned:   ${products.length}`);
        console.log(`Products Migrated:        ${migratedCount}`);
        console.log(`Products Skipped:         ${skippedCount}`);
        console.log(`New Variants Created:     ${variantCount}`);
        console.log(`New Stocks Created:       ${stockCount}`);
        console.log("===================================================\n");

    } catch (error) {
        console.error("❌ Migration failed with error:", error);
    } finally {
        await mongoose.connection.close();
        console.log("Database connection closed.");
    }
}

runMigration();
