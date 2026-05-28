import productModel from "../model/product.model.js";

export const convertUnit = (value, fromUnit, toUnit) => {
    const unitMap = {
        g: { type: 'weight', factor: 0.001 },
        kg: { type: 'weight', factor: 1 },
        ml: { type: 'volume', factor: 0.001 },
        l: { type: 'volume', factor: 1 },
        pc: { type: 'piece', factor: 1 }
    };

    const from = unitMap[fromUnit.toLowerCase()];
    const to = unitMap[toUnit.toLowerCase()];

    if (!from || !to) {
        throw new Error(`Invalid unit: ${fromUnit} or ${toUnit}`);
    }

    if (from.type !== to.type) {
        throw new Error(`Incompatible unit conversion from ${fromUnit} to ${toUnit}`);
    }

    const valueInBase = value * from.factor;
    return valueInBase / to.factor;
};

export const checkStockAvailability = async (items) => {
    const productRequirements = {};
    const packRequirements = {};

    for (const item of items) {
        const prodId = item.productId.toString();
        const packId = item.packSizeId.toString();
        const qty = item.quantity;

        const product = await productModel.findById(prodId);
        if (!product) {
            return { isValid: false, message: `Product not found: ${prodId}` };
        }

        const pack = product.packSizes.find(p => p._id.toString() === packId);
        if (!pack) {
            return { isValid: false, message: `Pack size not found for product "${product.productName}"` };
        }

        const key = `${prodId}_${packId}`;
        if (!packRequirements[key]) {
            packRequirements[key] = { product, pack, qtyNeeded: 0 };
        }
        packRequirements[key].qtyNeeded += qty;

        const itemWeight = qty * pack.weight;
        const convertedWeight = convertUnit(itemWeight, pack.unit, product.totalQuantity.unit);

        if (!productRequirements[prodId]) {
            productRequirements[prodId] = { product, totalNeeded: 0 };
        }
        productRequirements[prodId].totalNeeded += convertedWeight;
    }

    for (const key in packRequirements) {
        const { product, pack, qtyNeeded } = packRequirements[key];
        if (pack.stock < qtyNeeded) {
            return {
                isValid: false,
                message: `Insufficient stock for pack size (${pack.weight} ${pack.unit}) of product "${product.productName}". Available: ${pack.stock}, Requested: ${qtyNeeded}`
            };
        }
    }

    for (const prodId in productRequirements) {
        const { product, totalNeeded } = productRequirements[prodId];
        if (product.totalQuantity.value < totalNeeded) {
            return {
                isValid: false,
                message: `Insufficient overall stock for product "${product.productName}". Available: ${product.totalQuantity.value} ${product.totalQuantity.unit}, Requested: ${totalNeeded} ${product.totalQuantity.unit}`
            };
        }
    }

    return { isValid: true };
};

export const updateStock = async (items, direction) => {
    for (const item of items) {
        const prodId = item.productId.toString();
        const packId = item.packSizeId.toString();
        const qty = item.quantity;

        const product = await productModel.findById(prodId);
        if (!product) continue;

        const pack = product.packSizes.find(p => p._id.toString() === packId);
        if (!pack) continue;

        pack.stock += direction * qty;
        if (pack.stock < 0) pack.stock = 0;

        const itemWeight = qty * pack.weight;
        const convertedWeight = convertUnit(itemWeight, pack.unit, product.totalQuantity.unit);
        product.totalQuantity.value += direction * convertedWeight;
        if (product.totalQuantity.value < 0) product.totalQuantity.value = 0;

        product.inStock = product.totalQuantity.value > 0;

        await product.save();
    }
};
