
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";

function convertFirestoreDocument(doc) {
    const fields = doc.fields;

    return {
        id: doc.name.split("/").pop(),
        title: fields.title?.stringValue,
        categoryId: fields.categoryId?.stringValue,
        description: fields.description?.stringValue,
        price: Number(fields.price?.doubleValue ?? 0),
        quantity: Number(fields.quantity?.integerValue ?? 0),
        imageUrl: fields.imageUrl?.stringValue ?? "",
        isActive: fields.isActive?.booleanValue ?? false
    };
}

/**
 * Fetch all products from Firestore.
 * Requires a valid authenticated admin session.
 */
export async function getAllProducts() {

    // Get a valid session (refreshes the token if required)
    const session = await getValidUserSession();

    if (!session || !session.idToken) {
        throw new Error("Admin session not found. Please log in again.");
    }

    // Firestore REST API endpoint
    const url = `${FIRESTORE_URL}/products?pageSize=100`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = await response.json();

    // Handle Firebase API errors
    if (!response.ok) {
        throw new Error(
            data.error?.message || "Failed to fetch products."
        );
    }

    // Temporarily inspect the original Firestore response
    console.log("Raw Firestore Products Response:", data);

    return (data.documents || []).map(convertFirestoreDocument);
}

export async function getProductById(productId) {

    const session = await getValidUserSession();

    if (!session || !session.idToken) {
        throw new Error("Admin session not found.");
    }

    const url = `${FIRESTORE_URL}/products/${productId}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Failed to fetch product."
        );
    }

    return convertFirestoreDocument(data);
}

export async function getProductsByCategory(categoryId) {

    const session = await getValidUserSession();

    if (!session || !session.idToken) {
        throw new Error("Admin session not found.");
    }

    const url = `${FIRESTORE_URL}:runQuery`;

    const query = {
        structuredQuery: {
            from: [{ collectionId: "products" }],
            where: {
                fieldFilter: {
                    field: { fieldPath: "categoryId" },
                    op: "EQUAL",
                    value: { stringValue: categoryId }
                }
            }
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(query)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Failed to fetch category products."
        );
    }

    return data
        .filter(item => item.document)
        .map(item => convertFirestoreDocument(item.document));
}

export async function getProductsPaginated(pageToken = null) {
    if (pageToken !== null && !pageToken) {
        throw new Error("Invalid page token.");
    }

    const session = await getValidUserSession();

    if (!session || !session.idToken) {
        throw new Error("Admin session not found.");
    }

    let url = `${FIRESTORE_URL}/products?pageSize=10`;

    if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Failed to fetch products."
        );
    }

    return {
        products: (data.documents || []).map(convertFirestoreDocument),
        nextPageToken: data.nextPageToken || null
    };
}


export async function createProduct(product) {

    const session = await getValidUserSession();

    if (!session || !session.idToken) {
        throw new Error("Admin session not found.");
    }

    // Validate required fields
    const { id, categoryId, title, description, quantity, price } = product;

    if (!id || !categoryId || !title || !description) {
        throw new Error("Please provide all required product fields.");
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error("Quantity must be a non-negative integer.");
    }

    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new Error("Price must be a valid non-negative number.");
    }

    // Convert JavaScript values to Firestore REST format
    const firestoreDocument = {
        fields: {
            categoryId: { stringValue: categoryId },
            title: { stringValue: title },
            description: { stringValue: description },
            quantity: { integerValue: String(quantity) },
            price: { doubleValue: price },
            imageUrl: { stringValue: product.imageUrl || "" },
            isActive: { booleanValue: true }
        }
    };

    const url = `${FIRESTORE_URL}/products?documentId=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(firestoreDocument)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Failed to create product."
        );
    }

    return convertFirestoreDocument(data);
}


/* UPDATE PRODUCT DETAILS */
export async function updateProduct(productId, updatedData) {

    const session = await getValidUserSession();

    if (!session?.idToken) {
        throw new Error("Admin session not found.");
    }

    const allowedFields = [
        "categoryId",
        "title",
        "description",
        "quantity",
        "price",
        "imageUrl"
    ];

    const fields = {};

    for (const [key, value] of Object.entries(updatedData)) {

        if (!allowedFields.includes(key)) {
            throw new Error(`Field '${key}' cannot be updated.`);
        }

        if (key === "quantity") {
            if (!Number.isInteger(value) || value < 0) {
                throw new Error("Quantity must be a non-negative integer.");
            }
            fields[key] = { integerValue: String(value) };

        } else if (key === "price") {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
                throw new Error("Price must be a non-negative number.");
            }
            fields[key] = { doubleValue: value };

        } else {
            if (typeof value !== "string" || !value.trim()) {
                throw new Error(`${key} must be a non-empty string.`);
            }
            fields[key] = { stringValue: value };
        }
    }

    const fieldNames = Object.keys(fields);

    if (fieldNames.length === 0) {
        throw new Error("Provide at least one field to update.");
    }

    const params = new URLSearchParams();

    fieldNames.forEach(field => {
        params.append("updateMask.fieldPaths", field);
    });

    const url =
        `${FIRESTORE_URL}/products/${encodeURIComponent(productId)}?${params}`;

    const response = await fetch(url, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || "Failed to update product.");
    }

    return convertFirestoreDocument(data);
}


/* ACTIVATE / DEACTIVATE PRODUCT */
export async function setProductActive(productId, isActive) {

    const session = await getValidUserSession();

    if (!session?.idToken) {
        throw new Error("Admin session not found.");
    }

    if (typeof isActive !== "boolean") {
        throw new Error("isActive must be true or false.");
    }

    const url =
        `${FIRESTORE_URL}/products/${encodeURIComponent(productId)}?updateMask.fieldPaths=isActive`;

    const response = await fetch(url, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${session.idToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                isActive: { booleanValue: isActive }
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || "Failed to change product status.");
    }

    return convertFirestoreDocument(data);
}


/* PERMANENTLY DELETE PRODUCT */
export async function deleteProduct(productId) {

    const session = await getValidUserSession();

    if (!session?.idToken) {
        throw new Error("Admin session not found.");
    }

    const url =
        `${FIRESTORE_URL}/products/${encodeURIComponent(productId)}`;

    const response = await fetch(url, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${session.idToken}`
        }
    });

    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to delete product.");
    }

    return {
        success: true,
        id: productId,
        message: "Product deleted successfully."
    };
}
