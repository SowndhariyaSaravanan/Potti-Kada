
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";

const USERS_URL = `${FIRESTORE_URL}/users`;

// Convert Firestore field values into normal JavaScript values.
function convertFirestoreValue(value) {
    if (!value) return null;

    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("nullValue" in value) return null;

    return null;
}

// Convert a Firestore document into a customer object.
function convertCustomerDocument(doc) {
    const customer = {};

    for (const [key, value] of Object.entries(doc.fields || {})) {
        customer[key] = convertFirestoreValue(value);
    }

    return {
        id: doc.name.split("/").pop(),
        ...customer
    };
}

// Get the authenticated user's ID token.
async function getAuthHeaders() {
    const session = await getValidUserSession();

    if (!session?.idToken) {
        throw new Error("Your session is invalid. Please log in again.");
    }

    return {
        Authorization: `Bearer ${session.idToken}`,
        "Content-Type": "application/json"
    };
}

// Handle Firebase API errors consistently.
async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error.error?.message || `Request failed (${response.status})`
        );
    }

    return response.status === 204 ? null : response.json();
}

// Fetch all customer documents, handling Firestore pagination.

export async function getAllCustomers() {
    const headers = await getAuthHeaders();

    const response = await fetch(`${FIRESTORE_URL}:runQuery`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            structuredQuery: {
                from: [
                    { collectionId: "users" }
                ],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "role" },
                        op: "EQUAL",
                        value: { stringValue: "customer" }
                    }
                }
            }
        })
    });

    const data = await handleResponse(response);

    return data
        .filter(item => item.document)
        .map(item => convertCustomerDocument(item.document));
}

// Fetch one customer using their Firestore document ID.
export async function getCustomerById(customerId) {
    if (!customerId?.trim()) {
        throw new Error("Customer ID is required.");
    }

    const headers = await getAuthHeaders();

    const response = await fetch(
        `${USERS_URL}/${encodeURIComponent(customerId)}`,
        { headers }
    );

    const data = await handleResponse(response);
    const customer = convertCustomerDocument(data);

    if (customer.role !== "customer") {
        throw new Error("Customer not found.");
    }

    return customer;
}

// Search customers by name, email, or mobile number.
export async function searchCustomers(searchTerm = "") {
    const customers = await getAllCustomers();
    const term = searchTerm.trim().toLowerCase();

    if (!term) return customers;

    return customers.filter(customer =>
        customer.name?.toLowerCase().includes(term) ||
        customer.email?.toLowerCase().includes(term) ||
        customer.mobile?.toLowerCase().includes(term) ||
        customer.id?.toLowerCase().includes(term)
    );
}

// Return a page of customers.
export async function getCustomersPaginated(page = 1, pageSize = 5) {
    if (!Number.isInteger(page) || page < 1) {
        throw new Error("Page must be a positive integer.");
    }

    if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new Error("Page size must be a positive integer.");
    }

    const customers = await getAllCustomers();
    const totalCustomers = customers.length;
    const totalPages = Math.ceil(totalCustomers / pageSize);
    const startIndex = (page - 1) * pageSize;

    return {
        customers: customers.slice(startIndex, startIndex + pageSize),
        currentPage: page,
        pageSize,
        totalCustomers,
        totalPages
    };
}

// Update only the customer's creditLimit field.
export async function updateCustomerCreditLimit(customerId, creditLimit) {
    if (!customerId?.trim()) {
        throw new Error("Customer ID is required.");
    }

    if (
        typeof creditLimit !== "number" ||
        !Number.isFinite(creditLimit) ||
        creditLimit < 0
    ) {
        throw new Error("Credit limit must be a valid non-negative number.");
    }

    // Verify that the document belongs to a customer.
    const customer = await getCustomerById(customerId);

    if (creditLimit < (customer.creditUsed || 0)) {
        throw new Error(
            "Credit limit cannot be less than the customer's current credit usage."
        );
    }

    const headers = await getAuthHeaders();

    const url = new URL(`${USERS_URL}/${encodeURIComponent(customerId)}`);
    url.searchParams.append("updateMask.fieldPaths", "creditLimit");
    url.searchParams.append("updateMask.fieldPaths", "updatedAt");

    const updatedAt = new Date().toISOString();

    const response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            fields: {
                creditLimit: { doubleValue: creditLimit },
                updatedAt: { timestampValue: updatedAt }
            }
        })
    });

    return convertCustomerDocument(await handleResponse(response));
}

// Activate or deactivate a customer account.
export async function setCustomerActive(customerId, isActive) {
    if (!customerId?.trim()) {
        throw new Error("Customer ID is required.");
    }

    if (typeof isActive !== "boolean") {
        throw new Error("Customer status must be true or false.");
    }

    await getCustomerById(customerId);

    const headers = await getAuthHeaders();

    const url = new URL(`${USERS_URL}/${encodeURIComponent(customerId)}`);
    url.searchParams.append("updateMask.fieldPaths", "isActive");
    url.searchParams.append("updateMask.fieldPaths", "updatedAt");

    const response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            fields: {
                isActive: { booleanValue: isActive },
                updatedAt: { timestampValue: new Date().toISOString() }
            }
        })
    });

    return convertCustomerDocument(await handleResponse(response));
}
