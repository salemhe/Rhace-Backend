const scrapeSensitiveInfo = (vendor, fieldsToReturn) => {
    const sensitiveFields = ['password', 'email', 'paymentDetails'];
    const result = {};

    fieldsToReturn.forEach(field => {
        if (!sensitiveFields.includes(field)) {
            if (Array.isArray(vendor[field])) {
                // Filter sensitive info from arrays
                result[field] = vendor[field].map(item => {
                    const filteredItem = {};
                    Object.keys(item).forEach(key => {
                        if (!sensitiveFields.includes(key)) {
                            filteredItem[key] = item[key];
                        }
                    });
                    return filteredItem;
                });
            } else {
                result[field] = vendor[field];
            }
        }
    });

    return result;
};

const filterVendorData = (vendor) => {
    const fieldsToReturn = Object.keys(vendor._doc); // Get all fields from the vendor document
    return scrapeSensitiveInfo(vendor, fieldsToReturn);
};

export { filterVendorData };