"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasField = hasField;
exports.hasAllFields = hasAllFields;
exports.findValidCustomType = findValidCustomType;
exports.addOrUpdateCustomType = addOrUpdateCustomType;
exports.deleteOrUpdateCustomType = deleteOrUpdateCustomType;
exports.getCustomFieldUpdateActions = getCustomFieldUpdateActions;
const logger_1 = require("../../libs/logger");
const customTypeClient_1 = require("./customTypeClient");
function hasField(type, fieldName) {
    return !!type.fieldDefinitions?.some((field) => field.name === fieldName);
}
function hasAllFields(customType, type) {
    return customType.fieldDefinitions?.every(({ name }) => hasField(type, name));
}
function findValidCustomType(allTypes, customType) {
    if (customType.fieldDefinitions?.length === 0) {
        return undefined;
    }
    for (const type of allTypes) {
        const match = hasAllFields(customType, type);
        if (match) {
            return type;
        }
    }
    return undefined;
}
async function addOrUpdateCustomType(customType) {
    const resourceTypeId = customType.resourceTypeIds[0];
    const types = await (0, customTypeClient_1.getTypesByResourceTypeId)(resourceTypeId);
    // Check if the specific custom type (by key) already exists
    const existingType = types.find((type) => type.key === customType.key);
    if (!existingType) {
        await (0, customTypeClient_1.createCustomType)(customType);
        logger_1.log.info(`Custom Type "${customType.key}" created successfully.`);
        return;
    }
    logger_1.log.info(`Custom Type with resourceTypeId "${resourceTypeId}" already exists. Skipping creation.`);
    for (const type of types) {
        const { key, version } = type;
        const fieldUpdates = (customType.fieldDefinitions ?? [])
            .filter(({ name }) => !hasField(type, name))
            .map((fieldDefinition) => ({
            action: 'addFieldDefinition',
            fieldDefinition,
        }));
        if (!fieldUpdates.length) {
            logger_1.log.info(`Custom Type "${key}" already contains all required fields. Skipping update.`);
            continue;
        }
        await (0, customTypeClient_1.updateCustomTypeByKey)({ key, version, actions: fieldUpdates });
        logger_1.log.info(`Custom Type "${key}" updated successfully with new fields.`);
    }
}
async function deleteOrUpdateCustomType(customType) {
    const resourceTypeId = customType.resourceTypeIds[0];
    const types = await (0, customTypeClient_1.getTypesByResourceTypeId)(resourceTypeId);
    if (!types.length) {
        logger_1.log.info(`Custom Type with resourceTypeId "${resourceTypeId}" does not exist. Skipping deletion.`);
        return;
    }
    for (const type of types) {
        const { key, version } = type;
        const fieldUpdates = (customType.fieldDefinitions ?? [])
            .filter(({ name }) => hasField(type, name))
            .map(({ name }) => ({
            action: 'removeFieldDefinition',
            fieldName: name,
        }));
        if (!fieldUpdates.length) {
            logger_1.log.info(`Custom Type "${key}" has no matching fields to remove. Skipping deletion.`);
            continue;
        }
        const hasSameFields = fieldUpdates.length === type.fieldDefinitions?.length;
        if (!hasSameFields) {
            await (0, customTypeClient_1.updateCustomTypeByKey)({ key, version, actions: fieldUpdates });
            logger_1.log.info(`Removed ${fieldUpdates.length} fields(s) from Custom Type "${key}" successfully.`);
            continue;
        }
        try {
            await (0, customTypeClient_1.deleteCustomTypeByKey)({ key, version });
            logger_1.log.info(`Custom Type "${key}" deleted successfully.`);
        }
        catch (error) {
            const referencedMessage = 'Can not delete a type while it is referenced';
            if (error instanceof Error && error.message.includes(referencedMessage)) {
                logger_1.log.warn(`Custom Type "${key}" is referenced by at least one customer. Skipping deletion.`);
            }
            else {
                throw error;
            }
        }
    }
}
/**
 * This function is used to get the actions for setting a custom field in a customer.
 * If the custom type exists and all fields exist, it returns `setCustomField` actions,
 * if not, it returns `setCustomType` action.
 * @returns An array of actions to update the custom field in the customer.
 **/
async function getCustomFieldUpdateActions({ customFields, fields, customType, }) {
    const resourceTypeId = customType.resourceTypeIds[0];
    const allTypes = await (0, customTypeClient_1.getTypesByResourceTypeId)(resourceTypeId);
    if (!allTypes.length) {
        throw new Error(`Custom Type not found for resource "${resourceTypeId.toUpperCase()}"`);
    }
    const typeAssigned = allTypes.find(({ id }) => id === customFields?.type.id);
    const allFieldsExist = !!(typeAssigned && hasAllFields(customType, typeAssigned));
    if (customFields?.type.id && allFieldsExist) {
        return Object.entries(fields).map(([name, value]) => ({
            action: 'setCustomField',
            name,
            value,
        }));
    }
    const newType = allTypes.find(({ key }) => key === customType.key) ?? findValidCustomType(allTypes, customType);
    if (!newType) {
        throw new Error(`A valid Custom Type was not found for resource "${resourceTypeId.toUpperCase()}"`);
    }
    return [
        {
            action: 'setCustomType',
            type: { key: newType.key, typeId: 'type' },
            fields,
        },
    ];
}
