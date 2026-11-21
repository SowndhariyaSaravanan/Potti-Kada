
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";

function decodeValue(value) {
    if (!value) return null;

    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("nullValue" in value) return null;

    return null;
}

function decodeProduct(document) {
    const fields = document.fields || {};

    return {
        id: document.name.split("/").pop(),
        categoryId: decodeValue(fields.categoryId),
        title: decodeValue(fields.title) || "",
        description: decodeValue(fields.description) || "",
        quantity: decodeValue(fields.quantity) || 0,
        price: decodeValue(fields.price) || 0,
        imageUrl: decodeValue(fields.imageUrl) || "",
        isActive: decodeValue(fields.isActive) === true
    };
}

async function getHeaders() {
    const session = await getValidUserSession();

    if (!session) {
        throw new Error("Please log in to continue.");
    }

    return {
        Authorization: `Bearer ${session.idToken}`
    };
}

export async function getAllProducts() {
    const headers = await getHeaders();

    const response = await fetch(
        `${FIRESTORE_URL}/products?pageSize=1000`,
        { headers }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Unable to load products."
        );
    }

    return (data.documents || []).map(decodeProduct);
}

export async function getActiveProducts() {
    const products = await getAllProducts();

    return products.filter(product => product.isActive);
}

export async function getProductById(productId) {
    const headers = await getHeaders();

    const response = await fetch(
        `${FIRESTORE_URL}/products/${encodeURIComponent(productId)}`,
        { headers }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Product not found."
        );
    }

    return decodeProduct(data);
}

export async function getProductCategories() {
    const products = await getActiveProducts();

    return [
        ...new Set(
            products
                .map(product => product.categoryId)
                .filter(Boolean)
        )
    ].sort();
}
