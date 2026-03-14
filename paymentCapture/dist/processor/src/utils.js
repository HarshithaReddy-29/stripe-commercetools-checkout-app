"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUUID = exports.parseJSON = void 0;
const parseJSON = (json) => {
    try {
        return JSON.parse(json || '{}');
    }
    catch (error) {
        console.error('Error parsing JSON', error);
        return {};
    }
};
exports.parseJSON = parseJSON;
const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};
exports.isValidUUID = isValidUUID;
