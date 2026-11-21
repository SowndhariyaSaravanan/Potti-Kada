
import { FIRESTORE_URL } from "../firebase/firebase-config.js";
import { getValidUserSession } from "./auth-service.js";
import { getAllCustomers } from "./customer-service.js";
import { getAllProducts } from "./inventory-service.js";

function convertFirestoreValue(value) {
    if (!value || typeof value !== "object") return value;

    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("nullValue" in value) return null;

    if ("arrayValue" in value) {
        return (value.arrayValue.values || []).map(convertFirestoreValue);
    }

    if ("mapValue" in value) {
        return convertFirestoreFields(value.mapValue.fields || {});
    }

    return value;
}

function convertFirestoreFields(fields = {}) {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
            key,
            convertFirestoreValue(value)
        ])
    );
}

function convertDocument(document) {
    return {
        id: document.name.split("/").pop(),
        ...convertFirestoreFields(document.fields || {})
    };
}

async function getAuthHeaders() {
    const session = await getValidUserSession();

    if (!session?.idToken) {
        throw new Error("Your session has expired. Please log in again.");
    }

    return {
        Authorization: `Bearer ${session.idToken}`,
        "Content-Type": "application/json"
    };
}

async function getCollection(collectionName, headers) {
    const documents = [];
    let pageToken = null;

    do {
        const url = new URL(`${FIRESTORE_URL}/${collectionName}`);
        url.searchParams.set("pageSize", "1000");

        if (pageToken) {
            url.searchParams.set("pageToken", pageToken);
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(
                error.error?.message ||
                `Unable to load ${collectionName}.`
            );
        }

        const data = await response.json();

        documents.push(
            ...(data.documents || []).map(convertDocument)
        );

        pageToken = data.nextPageToken || null;

    } while (pageToken);

    return documents;
}

/**
 * Loads the data required by all admin reports.
 */
export async function getAdminReportData() {
    const headers = await getAuthHeaders();

    const [
        customers,
        products,
        orders,
        sales
    ] = await Promise.all([
        getAllCustomers(),
        getAllProducts(),
        getCollection("orders", headers),
        getCollection("sales", headers)
    ]);

    return {
        customers,
        products,
        orders,
        sales
    };
}
