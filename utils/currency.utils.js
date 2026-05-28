import UserModel from "../model/user.model.js";

const rates = {
    USD: 1.0,
    INR: 83.0,
    AED: 3.67,
    NZD: 1.65
};

export const getCurrencyRate = (user) => {
    if (user && user.selectedCurrency && rates[user.selectedCurrency]) {
        return { currency: user.selectedCurrency, rate: rates[user.selectedCurrency] };
    }
    return { currency: "USD", rate: 1.0 };
};

export const convertPrice = (price, rate) => {
    if (price == null) return null;
    return Number((price * rate).toFixed(2));
};
