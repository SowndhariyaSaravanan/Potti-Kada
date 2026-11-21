
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";
import { getProductById } from "./product-service.js";

function encodeCartItems(items) {
    return {
        arrayValue: {
            values: items.map(item => ({
                mapValue: {
                    fields: {
                        productId: { stringValue: item.productId },
                        title: { stringValue: item.title },
                        price: { doubleValue: Number(item.price) },
                        quantity: { integerValue: String(item.quantity) },
                        imageUrl: { stringValue: item.imageUrl || "" }
                    }
                }
            }))
        }
    };
}

function decodeValue(value) {
    if (!value) return null;

    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);

    return null;
}

function decodeItems(value) {
    const values = value?.arrayValue?.values || [];

    return values.map(entry => {
        const fields = entry.mapValue?.fields || {};

        return {
            productId: decodeValue(fields.productId),
            title: decodeValue(fields.title),
            price: decodeValue(fields.price),
            quantity: decodeValue(fields.quantity),
            imageUrl: decodeValue(fields.imageUrl) || ""
        };
    });
}

async function getSession() {
    const session = await getValidUserSession();

    if (!session) {
        throw new Error("Please log in to access your cart.");
    }

    return session;
}

async function readCartDocument(session) {
    const response = await fetch(
        `${FIRESTORE_URL}/carts/${encodeURIComponent(session.uid)}`,
        {
            headers: {
                Authorization: `Bearer ${session.idToken}`
            }
        }
    );

    if (response.status === 404) {
        return null;
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Unable to load cart."
        );
    }

    return data;
}

export async function getCart() {
    const session = await getSession();
    const document = await readCartDocument(session);

    if (!document) return [];

    return decodeItems(document.fields?.items);
}

async function saveCart(session, items) {
    const existing = await readCartDocument(session);

    const fields = {
        customerId: { stringValue: session.uid },
        items: encodeCartItems(items),
        updatedAt: { timestampValue: new Date().toISOString() }
    };

    let response;

    if (existing) {
        const url = new URL(
            `${FIRESTORE_URL}/carts/${encodeURIComponent(session.uid)}`
        );

        Object.keys(fields).forEach(field => {
            url.searchParams.append("updateMask.fieldPaths", field);
        });

        response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.idToken}`
            },
            body: JSON.stringify({ fields })
        });
    } else {
        response = await fetch(
            `${FIRESTORE_URL}/carts?documentId=${encodeURIComponent(session.uid)}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.idToken}`
                },
                body: JSON.stringify({ fields })
            }
        );
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Unable to save cart."
        );
    }

    return items;
}

export async function addToCart(product, quantity = 1) {
    const session = await getSession();

    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Enter a valid quantity.");
    }

    if (quantity > product.quantity) {
        throw new Error("Requested quantity exceeds available stock.");
    }

    const items = await getCart();
    const existing = items.find(
        item => item.productId === product.id
    );

    if (existing) {
        const newQuantity = existing.quantity + quantity;

        if (newQuantity > product.quantity) {
            throw new Error(
                `Only ${product.quantity} units are available.`
            );
        }

        existing.quantity = newQuantity;
    } else {
        items.push({
            productId: product.id,
            title: product.title,
            price: product.price,
            quantity,
            imageUrl: product.imageUrl || ""
        });
    }

    return await saveCart(session, items);
}

export async function updateCartItemQuantity(productId, quantity) {
    const session = await getSession();

    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Quantity must be at least 1.");
    }

    const product = await getProductById(productId);

    if (quantity > product.quantity) {
        throw new Error(
            `Only ${product.quantity} units are available.`
        );
    }

    const items = await getCart();
    const item = items.find(
        entry => entry.productId === productId
    );

    if (!item) {
        throw new Error("Cart item not found.");
    }

    item.quantity = quantity;

    return await saveCart(session, items);
}

export async function removeFromCart(productId) {
    const session = await getSession();

    const items = await getCart();
    const updatedItems = items.filter(
        item => item.productId !== productId
    );

    return await saveCart(session, updatedItems);
}

export async function clearCart() {
    const session = await getSession();

    return await saveCart(session, []);
}
