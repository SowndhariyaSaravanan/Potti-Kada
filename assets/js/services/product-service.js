
import { FIRESTORE_URL } from "../firebase/firebase-config.js";

// Decode Firestore field values
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

// Convert a Firestore product document into a JavaScript object
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

// No authentication headers are needed for public product reads
async function fetchProducts(url, errorMessage) {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || errorMessage
        );
    }

    return data;
}

// Get all products
export async function getAllProducts() {
    const data = await fetchProducts(
        `${FIRESTORE_URL}/products?pageSize=1000`,
        "Unable to load products."
    );

    return (data.documents || []).map(decodeProduct);
}

// Get only active products
export async function getActiveProducts() {
    const products = await getAllProducts();

    return products.filter(product => product.isActive);
}

// Get one product using its document ID
export async function getProductById(productId) {
    if (!productId) {
        throw new Error("Product ID is required.");
    }

    const data = await fetchProducts(
        `${FIRESTORE_URL}/products/${encodeURIComponent(productId)}`,
        "Product not found."
    );

    return decodeProduct(data);
}

// Get unique categories from active products
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
