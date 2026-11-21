import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import {
    getValidUserSession,
    getUserProfile
} from "./auth-service.js";
import { getCart, clearCart } from "./cart-service.js";
import { getProductById } from "./product-service.js";

const FIRESTORE_RESOURCE_ROOT = FIRESTORE_URL.replace(
    "https://firestore.googleapis.com/v1/",
    ""
);

function decodeValue(value) {
    if (!value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("arrayValue" in value) {
        return (value.arrayValue.values || []).map(entry => {
            if (entry.mapValue?.fields) {
                const item = {};
                for (const [key, nested] of Object.entries(entry.mapValue.fields)) {
                    item[key] = decodeValue(nested);
                }
                return item;
            }
            return decodeValue(entry);
        });
    }
    return null;
}

function decodeDocument(document) {
    const result = {};
    for (const [key, value] of Object.entries(document.fields || {})) {
        result[key] = decodeValue(value);
    }
    return { id: document.name.split("/").pop(), ...result };
}

function firestoreFields(values) {
    const fields = {};
    for (const [key, value] of Object.entries(values)) {
        if (typeof value === "string") fields[key] = { stringValue: value };
        else if (typeof value === "boolean") fields[key] = { booleanValue: value };
        else if (Number.isInteger(value)) fields[key] = { integerValue: String(value) };
        else if (typeof value === "number") fields[key] = { doubleValue: value };
        else if (value instanceof Date) fields[key] = { timestampValue: value.toISOString() };
    }
    return fields;
}

function encodeOrderItems(items) {
    return {
        arrayValue: {
            values: items.map(item => ({
                mapValue: {
                    fields: {
                        productId: { stringValue: item.productId },
                        productTitle: { stringValue: item.title },
                        unitPrice: { doubleValue: Number(item.price) },
                        quantity: { integerValue: String(item.quantity) },
                        lineTotal: { doubleValue: Number(item.price) * Number(item.quantity) }
                    }
                }
            }))
        }
    };
}

async function getDocument(path, idToken) {
    const response = await fetch(`${FIRESTORE_URL}/${path}`, {
        headers: { Authorization: `Bearer ${idToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error?.message || `Unable to read ${path}.`);
    }
    return data;
}

function makeId(prefix, suffix = "") {
    return `${prefix}_${Date.now()}_${suffix || Math.random().toString(36).slice(2, 8)}`;
}

async function commitWrites(session, writes) {
    const response = await fetch(`${FIRESTORE_URL}:commit`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.idToken}`
        },
        body: JSON.stringify({ writes })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error?.message || "Unable to place the order.");
    }
    return data;
}

// Places an order and writes matching sales rows using the existing SALE schema.
export async function placeOrder(paymentMethod) {
    if (!["cash", "credit"].includes(paymentMethod)) {
        throw new Error("Select a valid payment method.");
    }

    const session = await getValidUserSession();
    if (!session) {
        throw new Error("Please sign in before placing an order.");
    }

    const profile = await getUserProfile(session.uid, session.idToken);
    if (profile.role !== "customer" || !profile.isActive) {
        throw new Error("An active customer account is required to place an order.");
    }

    const cart = await getCart();
    if (!cart.length) throw new Error("Your cart is empty.");

    // Re-read products so checkout uses current prices and stock, not stale cart values.
    const verifiedItems = [];
    for (const cartItem of cart) {
        const product = await getProductById(cartItem.productId);
        if (!product || !product.isActive) {
            throw new Error(`${cartItem.title} is no longer available.`);
        }
        const quantity = Number(cartItem.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(product.quantity)) {
            throw new Error(`Insufficient stock for ${product.title}. Available: ${product.quantity}.`);
        }
        verifiedItems.push({
            productId: product.id,
            title: product.title,
            categoryId: product.categoryId || "",
            price: Number(product.price),
            quantity,
            currentStock: Number(product.quantity)
        });
    }

    const totalAmount = verifiedItems.reduce(
        (sum, item) => sum + item.price * item.quantity, 0
    );

    if (paymentMethod === "credit") {
        const availableCredit = Number(profile.creditLimit || 0) - Number(profile.creditUsed || 0);
        if (totalAmount > availableCredit) {
            throw new Error(
                `Insufficient credit. Available credit: ₹${availableCredit.toFixed(2)}.`
            );
        }
    }

    // Read update times for optimistic concurrency and atomic stock/credit updates.
    const userDocument = await getDocument(`users/${encodeURIComponent(session.uid)}`, session.idToken);
    const orderId = makeId("ORD");
    const createdAt = new Date().toISOString();
    const writes = [];

    const orderFields = {
        customerId: { stringValue: session.uid },
        customerName: { stringValue: profile.name || "" },
        customerEmail: { stringValue: profile.email || session.email || "" },
        totalAmount: { doubleValue: totalAmount },
        paymentMethod: { stringValue: paymentMethod },
        status: { stringValue: "placed" },
        createdAt: { timestampValue: createdAt },
        items: encodeOrderItems(verifiedItems)
    };

    writes.push({
        update: {
            name: `${FIRESTORE_RESOURCE_ROOT}/orders/${orderId}`,
            fields: orderFields
        },
        currentDocument: { exists: false }
    });

    verifiedItems.forEach((item, index) => {
        const saleId = makeId("SALE", `${index + 1}_${Math.random().toString(36).slice(2, 6)}`);
        const lineTotal = item.price * item.quantity;

        // Sales fields intentionally match SALE_001:
        // categoryId, createdAt, customerId, lineTotal, orderId,
        // paymentMethod, productId, productTitle, quantity, unitPrice.
        writes.push({
            update: {
                name: `${FIRESTORE_RESOURCE_ROOT}/sales/${saleId}`,
                fields: {
                    categoryId: { stringValue: item.categoryId },
                    createdAt: { timestampValue: createdAt },
                    customerId: { stringValue: session.uid },
                    lineTotal: { doubleValue: lineTotal },
                    orderId: { stringValue: orderId },
                    paymentMethod: { stringValue: paymentMethod },
                    productId: { stringValue: item.productId },
                    productTitle: { stringValue: item.title },
                    quantity: { integerValue: String(item.quantity) },
                    unitPrice: { doubleValue: item.price }
                }
            },
            currentDocument: { exists: false }
        });
    });

    for (const item of verifiedItems) {
        const productDocument = await getDocument(
            `products/${encodeURIComponent(item.productId)}`,
            session.idToken
        );
        const remainingStock = Number(item.currentStock) - item.quantity;

        writes.push({
            update: {
                name: productDocument.name,
                fields: {
                    quantity: { integerValue: String(remainingStock) }
                }
            },
            updateMask: { fieldPaths: ["quantity"] },
            currentDocument: { updateTime: productDocument.updateTime }
        });
    }

    if (paymentMethod === "credit") {
        const newCreditUsed = Number(profile.creditUsed || 0) + totalAmount;
        writes.push({
            update: {
                name: userDocument.name,
                fields: {
                    creditUsed: { doubleValue: newCreditUsed },
                    updatedAt: { timestampValue: createdAt }
                }
            },
            updateMask: {
                fieldPaths: ["creditUsed", "updatedAt"]
            },
            currentDocument: {
                updateTime: userDocument.updateTime
            }
        });
    }

    // Firestore commit makes order, sales, stock and credit changes atomic.
    await commitWrites(session, writes);

    // Clear cart only after the successful atomic order commit.
    try {
        await clearCart();
    } catch (error) {
        console.warn("Order placed, but cart cleanup failed:", error);
    }

    return {
        orderId,
        totalAmount,
        paymentMethod,
        createdAt,
        items: verifiedItems
    };
}


export async function getMyOrders() {
    const session = await getValidUserSession();

    if (!session) {
        throw new Error("Please sign in to view your orders.");
    }

    const response = await fetch(`${FIRESTORE_URL}:runQuery`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.idToken}`
        },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "orders" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "customerId" },
                        op: "EQUAL",
                        value: { stringValue: session.uid }
                    }
                }
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || "Unable to load order history.");
    }

    return data
        .filter(row => row.document)
        .map(row => decodeDocument(row.document))
        .sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
}
