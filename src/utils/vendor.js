const scrapeSensitiveInfo = (vendor, fieldsToReturn) => {
    const sensitiveFields = ['password', 'paymentDetails', 'percentageCharge', 'resetPasswordExpires', 'resetPasswordToken', 'balance'];
    const result = {};

    fieldsToReturn.forEach(field => {
        if (!sensitiveFields.includes(field)) {
            result[field] = vendor[field];
        }
    });

    return result;
};

const filterVendorData = (vendors) => {
    return vendors.map(vendor => {
        const fieldsToReturn = Object.keys(vendor._doc);
        return scrapeSensitiveInfo(vendor, fieldsToReturn);
    });
};

export { filterVendorData };
