const sendSuccessResponse = function (response, output, options = {}) {
    const { statusCode = 200 } = options;
    return response.status(statusCode).json({
        status: 'success',
        output
    });
};

const sendErrorResponse = function (response, statusCode, errorMessage) {
    return response.status(statusCode).json({
        status: 'error',
        errorMessage
    });
};

export { sendErrorResponse, sendSuccessResponse };
