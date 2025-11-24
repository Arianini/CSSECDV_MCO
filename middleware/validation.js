const { logActivity } = require('./auth');

// ============================================
// DATA VALIDATION MODULE
// Following CSSECDV Requirements 2.3.1, 2.3.2, 2.3.3
// ============================================

/**
 * IMPORTANT: This module uses REJECTION, not sanitization (2.3.1)
 * All validation failures result in input rejection
 */

// ============================================
// VALIDATION RULES - Define allowed sets
// ============================================

const VALIDATION_RULES = {
    username: {
        minLength: 3,
        maxLength: 30,
        allowedChars: /^[a-zA-Z0-9_-]+$/,
        description: 'Username must be 3-30 characters, alphanumeric with underscores and hyphens only'
    },
    password: {
        minLength: 8,
        maxLength: 128,
        // Complexity checked in auth.js validatePassword()
        description: 'Password must be 8-128 characters'
    },
    caption: {
        minLength: 1,
        maxLength: 500,
        allowedChars: /^[a-zA-Z0-9\s\.,!?\-'"@#$%&*()+=\[\]{}:;/<>_~`]+$/,
        description: 'Caption must be 1-500 characters with standard text characters'
    },
    comment: {
        minLength: 1,
        maxLength: 300,
        allowedChars: /^[a-zA-Z0-9\s\.,!?\-'"@#$%&*()+=\[\]{}:;/<>_~`]+$/,
        description: 'Comment must be 1-300 characters with standard text characters'
    },
    userTag: {
        minLength: 3,
        maxLength: 35,
        allowedChars: /^u\/[a-zA-Z0-9_-]+$/,
        description: 'User tag must start with u/ followed by 1-32 alphanumeric characters, underscores, or hyphens'
    },
    postTag: {
        allowedValues: ['Food', 'Coffee', 'Baking', 'Travel', 'Gaming', 'Technology', 'Sports', 'Music', 'Art', 'General'],
        description: 'Post tag must be one of the predefined categories'
    },
    securityAnswer: {
        minLength: 3,
        maxLength: 100,
        allowedChars: /^[a-zA-Z0-9\s\-']+$/,
        description: 'Security answer must be 3-100 characters, alphanumeric with spaces, hyphens, and apostrophes'
    },
    profilePic: {
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        maxSize: 5 * 1024 * 1024, // 5MB
        description: 'Profile picture must be jpg, jpeg, png, gif, or webp format, max 5MB'
    },
    postImage: {
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        maxSize: 10 * 1024 * 1024, // 10MB
        description: 'Post image must be jpg, jpeg, png, gif, or webp format, max 10MB'
    },
    // Numeric validations
    page: {
        min: 1,
        max: 10000,
        type: 'integer',
        description: 'Page number must be an integer between 1 and 10000'
    },
    limit: {
        min: 1,
        max: 100,
        type: 'integer',
        description: 'Limit must be an integer between 1 and 100'
    }
};

// ============================================
// CORE VALIDATION FUNCTIONS
// ============================================

/**
 * Validate text input against rules
 * @param {string} input - The input to validate
 * @param {string} fieldName - Name of field (maps to VALIDATION_RULES)
 * @param {Object} req - Express request object (for logging)
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateText(input, fieldName, req = null) {
    const errors = [];
    const rule = VALIDATION_RULES[fieldName];
    
    if (!rule) {
        return { isValid: false, errors: [`No validation rule defined for ${fieldName}`] };
    }

    // Check if input exists
    if (input === null || input === undefined || input === '') {
        errors.push(`${fieldName} is required`);
        logValidationFailure(req, fieldName, input, 'Empty or null value');
        return { isValid: false, errors };
    }

    // 2.3.3 - Validate length
    if (rule.minLength && input.length < rule.minLength) {
        errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }
    
    if (rule.maxLength && input.length > rule.maxLength) {
        errors.push(`${fieldName} must not exceed ${rule.maxLength} characters`);
    }

    // 2.3.2 - Validate allowed characters (whitelist approach)
    if (rule.allowedChars && !rule.allowedChars.test(input)) {
        errors.push(`${fieldName} contains invalid characters. ${rule.description}`);
    }

    // 2.3.2 - Validate allowed values (for enum fields)
    if (rule.allowedValues && !rule.allowedValues.includes(input)) {
        errors.push(`${fieldName} must be one of: ${rule.allowedValues.join(', ')}`);
    }

    // 2.4.4 - Log validation failures
    if (errors.length > 0) {
        logValidationFailure(req, fieldName, input, errors.join('; '));
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate numeric input
 * @param {any} input - The input to validate
 * @param {string} fieldName - Name of field (maps to VALIDATION_RULES)
 * @param {Object} req - Express request object (for logging)
 * @returns {Object} { isValid: boolean, errors: string[], value: number }
 */
function validateNumeric(input, fieldName, req = null) {
    const errors = [];
    const rule = VALIDATION_RULES[fieldName];
    
    if (!rule) {
        return { isValid: false, errors: [`No validation rule defined for ${fieldName}`], value: null };
    }

    // Convert to number
    const numValue = rule.type === 'integer' ? parseInt(input, 10) : parseFloat(input);

    // Check if valid number
    if (isNaN(numValue)) {
        errors.push(`${fieldName} must be a valid number`);
        logValidationFailure(req, fieldName, input, 'Not a valid number');
        return { isValid: false, errors, value: null };
    }

    // Check if integer when required
    if (rule.type === 'integer' && !Number.isInteger(numValue)) {
        errors.push(`${fieldName} must be an integer`);
    }

    // 2.3.2 - Validate range
    if (rule.min !== undefined && numValue < rule.min) {
        errors.push(`${fieldName} must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && numValue > rule.max) {
        errors.push(`${fieldName} must not exceed ${rule.max}`);
    }

    // Check if unsigned when required
    if (rule.unsigned && numValue < 0) {
        errors.push(`${fieldName} must be a positive number`);
    }

    // 2.4.4 - Log validation failures
    if (errors.length > 0) {
        logValidationFailure(req, fieldName, input, errors.join('; '));
    }

    return {
        isValid: errors.length === 0,
        errors,
        value: numValue
    };
}

/**
 * Validate file upload
 * @param {Object} file - Multer file object
 * @param {string} fieldName - Name of field (maps to VALIDATION_RULES)
 * @param {Object} req - Express request object (for logging)
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateFile(file, fieldName, req = null) {
    const errors = [];
    const rule = VALIDATION_RULES[fieldName];
    
    if (!rule) {
        return { isValid: false, errors: [`No validation rule defined for ${fieldName}`] };
    }

    if (!file) {
        // File is optional in many cases
        return { isValid: true, errors: [] };
    }

    // Check file extension
    const fileExt = require('path').extname(file.originalname).toLowerCase();
    if (rule.allowedExtensions && !rule.allowedExtensions.includes(fileExt)) {
        errors.push(`File type ${fileExt} not allowed. Allowed types: ${rule.allowedExtensions.join(', ')}`);
    }

    // Check file size
    if (rule.maxSize && file.size > rule.maxSize) {
        const maxSizeMB = (rule.maxSize / (1024 * 1024)).toFixed(2);
        errors.push(`File size exceeds maximum of ${maxSizeMB}MB`);
    }

    // 2.4.4 - Log validation failures
    if (errors.length > 0) {
        logValidationFailure(req, fieldName, file.originalname, errors.join('; '));
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate MongoDB ObjectId
 * @param {string} id - The ID to validate
 * @param {string} fieldName - Name of field
 * @param {Object} req - Express request object (for logging)
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateObjectId(id, fieldName = 'ID', req = null) {
    const errors = [];
    
    // MongoDB ObjectId is 24 hex characters
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    
    if (!id || !objectIdPattern.test(id)) {
        errors.push(`${fieldName} is not a valid identifier`);
        logValidationFailure(req, fieldName, id, 'Invalid ObjectId format');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// ============================================
// VALIDATION MIDDLEWARE
// ============================================

/**
 * Middleware factory for validating request body fields
 * @param {Object} validationMap - Map of field names to validation types
 * Example: { username: 'text', age: 'numeric', postTag: 'text' }
 */
function validateRequest(validationMap) {
    return async (req, res, next) => {
        const errors = [];

        for (const [fieldName, validationType] of Object.entries(validationMap)) {
            const value = req.body[fieldName];

            // Skip optional fields if not provided
            if (value === undefined || value === null || value === '') {
                continue;
            }

            let result;
            switch (validationType) {
                case 'text':
                    result = validateText(value, fieldName, req);
                    break;
                case 'numeric':
                    result = validateNumeric(value, fieldName, req);
                    if (result.isValid) {
                        req.body[fieldName] = result.value; // Replace with typed value
                    }
                    break;
                case 'objectId':
                    result = validateObjectId(value, fieldName, req);
                    break;
                default:
                    result = { isValid: false, errors: [`Unknown validation type: ${validationType}`] };
            }

            if (!result.isValid) {
                errors.push(...result.errors);
            }
        }

        if (errors.length > 0) {
            // 2.3.1 - REJECT invalid input
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

/**
 * Middleware for validating query parameters
 */
function validateQuery(validationMap) {
    return async (req, res, next) => {
        const errors = [];

        for (const [fieldName, validationType] of Object.entries(validationMap)) {
            const value = req.query[fieldName];

            // Skip optional fields
            if (value === undefined || value === null || value === '') {
                continue;
            }

            let result;
            switch (validationType) {
                case 'text':
                    result = validateText(value, fieldName, req);
                    break;
                case 'numeric':
                    result = validateNumeric(value, fieldName, req);
                    if (result.isValid) {
                        req.query[fieldName] = result.value;
                    }
                    break;
                default:
                    result = { isValid: false, errors: [`Unknown validation type: ${validationType}`] };
            }

            if (!result.isValid) {
                errors.push(...result.errors);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

/**
 * Middleware for validating URL parameters
 */
function validateParams(validationMap) {
    return async (req, res, next) => {
        const errors = [];

        for (const [fieldName, validationType] of Object.entries(validationMap)) {
            const value = req.params[fieldName];

            if (value === undefined || value === null) {
                errors.push(`${fieldName} parameter is required`);
                continue;
            }

            let result;
            if (validationType === 'objectId') {
                result = validateObjectId(value, fieldName, req);
            } else {
                result = { isValid: false, errors: [`Unsupported validation type for params: ${validationType}`] };
            }

            if (!result.isValid) {
                errors.push(...result.errors);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid parameter',
                details: errors
            });
        }

        next();
    };
}

// ============================================
// LOGGING HELPER
// ============================================

/**
 * Log validation failure (Requirement 2.4.4)
 */
function logValidationFailure(req, fieldName, inputValue, errorMessage) {
    if (!req || !req.session) return;

    try {
        const userId = req.session.userId || null;
        const ipAddress = getClientIp(req);
        const truncatedInput = inputValue ? String(inputValue).substring(0, 100) : 'null';
        
        logActivity(
            userId,
            'VALIDATION_FAILED',
            'INPUT',
            fieldName,
            `Field: ${fieldName}, Error: ${errorMessage}, Input: ${truncatedInput}`,
            ipAddress
        );
    } catch (err) {
        console.error('Error logging validation failure:', err);
    }
}

function getClientIp(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           'unknown';
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Core validation functions
    validateText,
    validateNumeric,
    validateFile,
    validateObjectId,
    
    // Middleware
    validateRequest,
    validateQuery,
    validateParams,
    
    // Rules (for reference)
    VALIDATION_RULES
};
