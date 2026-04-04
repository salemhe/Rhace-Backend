const errorMiddleWare = (err, req, res, next) => {
    try {
        let error = {...err}

        error.message = err.message;

        console.log(err);

        // Mongoose bad Object
        if (err.name === 'CastError') {
            const message = 'Resource not Found';
            error = new Error(message);
            error.statusCode = 404;
        }

        // Mongoose duplicate Key
        if(err.code === 11000) {
            const message = 'Duplicate field value entered';
            error = new Error(message);
            error.statusCode = 400;
        }

        // Mongoose validation error
        if (err.name === 'ValidateionError') {
            const message = Object.values(err.errors).map(val => val.message)
            error = new Error(message.join(", "));
            error.statusCode = 400;
        }

        res.status(error.statusCode || 500).json({ success: false, message: error.message || "Server Error"})
    } catch (error) {
        next(error)
    }
}

export default errorMiddleWare