
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";
import { getProductById } from "./product-service.js";

const GUEST_CART_KEY = "guestShoppingCart";

// ------------------------------
// GUEST CART (localStorage)
// ------------------------------

export function getGuestCart() {
    try {
        return JSON.parse(localStorage.getItem(GUEST_CART_KEY)) || [];
    } catch {
        return [];
    }
}

function saveGuestCart(items) {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    return items;
}

// ------------------------------
// FIRESTORE ENCODE / DECODE
// ------------------------------

function encodeCartItems(items) {
    return {
        arrayValue: {
            values: items.map(item => ({
                mapValue: {
                    fields: {
                        productId: { stringValue: item.productId },
                        title: { stringValue: item.title || "" },
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
            title: decodeValue(fields.title) || "",
            price: decodeValue(fields.price) || 0,
            quantity: decodeValue(fields.quantity) || 0,
            imageUrl: decodeValue(fields.imageUrl) || ""
        };
    }).filter(item => item.productId);
}

// ------------------------------
// SESSION
// ------------------------------

async function getSession() {
    return await getValidUserSession();
}

// ------------------------------
// FIRESTORE CART OPERATIONS
// ------------------------------

async function readFirestoreCart(session) {
    const response = await fetch(
        `${FIRESTORE_URL}/carts/${encodeURIComponent(session.uid)}`,
        {
            headers: {
                Authorization: `Bearer ${session.idToken}`
            }
        }
    );

    if (response.status === 404) {
        return [];
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Unable to load cart."
        );
    }

    return decodeItems(data.fields?.items);
}

async function saveFirestoreCart(session, items) {
    const url = `${FIRESTORE_URL}/carts/${encodeURIComponent(session.uid)}`;

    const existingResponse = await fetch(url, {
        headers: {
            Authorization: `Bearer ${session.idToken}`
        }
    });

    let existing = false;

    if (existingResponse.status === 404) {
        existing = false;
    } else {
        const existingData = await existingResponse.json();

        if (!existingResponse.ok) {
            throw new Error(
                existingData.error?.message || "Unable to check cart."
            );
        }

        existing = true;
    }

    const fields = {
        customerId: { stringValue: session.uid },
        items: encodeCartItems(items),
        updatedAt: { timestampValue: new Date().toISOString() }
    };

    let response;

    if (existing) {
        const updateUrl = new URL(url);

        Object.keys(fields).forEach(field => {
            updateUrl.searchParams.append("updateMask.fieldPaths", field);
        });

        response = await fetch(updateUrl, {
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

// ------------------------------
// MERGE GUEST CART INTO USER CART
// ------------------------------

function mergeCartItems(existingItems, guestItems) {
    const merged = existingItems.map(item => ({ ...item }));

    guestItems.forEach(guestItem => {
        const existing = merged.find(
            item => item.productId === guestItem.productId
        );

        if (existing) {
            existing.quantity += guestItem.quantity;
        } else {
            merged.push({ ...guestItem });
        }
    });

    return merged;
}

export async function syncGuestCart(session, existingItems = null) {
    const guestItems = getGuestCart();

    if (!guestItems.length) {
        return existingItems || await readFirestoreCart(session);
    }

    const currentItems = existingItems || await readFirestoreCart(session);
    const mergedItems = mergeCartItems(currentItems, guestItems);
    const validItems = [];

    for (const item of mergedItems) {
        const product = await getProductById(item.productId);

        if (!product.isActive || product.quantity < 1) {
            continue;
        }

        const quantity = Math.min(
            Number(item.quantity),
            Number(product.quantity)
        );

        if (quantity < 1) {
            continue;
        }

        validItems.push({
            productId: product.id,
            title: product.title,
            price: product.price,
            quantity,
            imageUrl: product.imageUrl || ""
        });
    }

    await saveFirestoreCart(session, validItems);

    // Clear guest cart only after Firestore save succeeds
    localStorage.removeItem(GUEST_CART_KEY);

    return validItems;
}

// ------------------------------
// GET CART
// ------------------------------

export async function getCart() {
    const session = await getSession();

    // Guest: use localStorage
    if (!session) {
        return getGuestCart();
    }

    // Logged-in customer: load Firestore cart and merge guest cart
    return await syncGuestCart(session);
}

// ------------------------------
// ADD TO CART
// ------------------------------

export async function addToCart(product, quantity = 1) {
    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Enter a valid quantity.");
    }

    if (!product || !product.id) {
        throw new Error("Invalid product.");
    }

    if (!product.isActive) {
        throw new Error("This product is currently unavailable.");
    }

    if (quantity > Number(product.quantity)) {
        throw new Error("Requested quantity exceeds available stock.");
    }

    const session = await getSession();
    const items = session
        ? await getCart()
        : getGuestCart();

    const existing = items.find(
        item => item.productId === product.id
    );

    if (existing) {
        const newQuantity = Number(existing.quantity) + quantity;

        if (newQuantity > Number(product.quantity)) {
            throw new Error(
                `Only ${product.quantity} units are available.`
            );
        }

        existing.quantity = newQuantity;
    } else {
        items.push({
            productId: product.id,
            title: product.title,
            price: Number(product.price),
            quantity,
            imageUrl: product.imageUrl || ""
        });
    }

    if (session) {
        return await saveFirestoreCart(session, items);
    }

    return saveGuestCart(items);
}

// ------------------------------
// UPDATE CART ITEM QUANTITY
// ------------------------------

export async function updateCartItemQuantity(productId, quantity) {
    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Quantity must be at least 1.");
    }

    const product = await getProductById(productId);

    if (!product.isActive) {
        throw new Error("This product is currently unavailable.");
    }

    if (quantity > Number(product.quantity)) {
        throw new Error(
            `Only ${product.quantity} units are available.`
        );
    }

    const session = await getSession();
    const items = session
        ? await getCart()
        : getGuestCart();

    const item = items.find(
        entry => entry.productId === productId
    );

    if (!item) {
        throw new Error("Cart item not found.");
    }

    item.quantity = quantity;

    if (session) {
        return await saveFirestoreCart(session, items);
    }

    return saveGuestCart(items);
}

// ------------------------------
// REMOVE CART ITEM
// ------------------------------

export async function removeFromCart(productId) {
    const session = await getSession();
    const items = session
        ? await getCart()
        : getGuestCart();

    const updatedItems = items.filter(
        item => item.productId !== productId
    );

    if (session) {
        return await saveFirestoreCart(session, updatedItems);
    }

    return saveGuestCart(updatedItems);
}

// ------------------------------
// CLEAR CART
// ------------------------------

export async function clearCart() {
    const session = await getSession();

    if (session) {
        return await saveFirestoreCart(session, []);
    }

    return saveGuestCart([]);
}
