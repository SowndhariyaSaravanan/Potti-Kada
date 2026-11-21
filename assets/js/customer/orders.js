import { getValidUserSession } from "../services/auth-service.js";
import { getMyOrders } from "../services/order-service.js";

const $ = id => document.getElementById(id);

function currency(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 2
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
}

function showMessage(text, isError = false) {
    $("ordersMessage").textContent = text;
    $("ordersMessage").classList.toggle("error", isError);
}

function renderOrders(orders) {
    const container = $("ordersContainer");
    if (!orders.length) {
        container.innerHTML = `<p class="customer-empty">You haven't placed any orders yet. <a href="./products.html">Start shopping</a>.</p>`;
        return;
    }

    container.innerHTML = orders.map(order => {
        const date = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "—";
        const items = Array.isArray(order.items) ? order.items : [];
        return `
            <article class="order-card">
                <div class="order-card-heading">
                    <div>
                        <h2>${escapeHTML(order.id)}</h2>
                        <p>${escapeHTML(date)}</p>
                    </div>
                    <span class="order-status">${escapeHTML(order.status || "placed")}</span>
                </div>
                <div class="order-meta">
                    <span>Payment: <strong>${escapeHTML(String(order.paymentMethod || "").toUpperCase())}</strong></span>
                    <span>Total: <strong>${currency(order.totalAmount)}</strong></span>
                </div>
                ${items.length ? `
                    <div class="customer-cart-table-wrapper">
                        <table class="customer-cart-table">
                            <thead><tr><th>Product</th><th>Unit Price</th><th>Qty</th><th>Line Total</th></tr></thead>
                            <tbody>
                                ${items.map(item => {
            const fields = item || {};
            const title = fields.productTitle || fields.title || "";
            const price = Number(fields.unitPrice ?? fields.price ?? 0);
            const quantity = Number(fields.quantity || 0);
            const lineTotal = Number(fields.lineTotal ?? price * quantity);
            return `<tr><td>${escapeHTML(title)}</td><td>${currency(price)}</td><td>${quantity}</td><td>${currency(lineTotal)}</td></tr>`;
        }).join("")}
                            </tbody>
                        </table>
                    </div>` : `<p class="checkout-hint">Order item details are not available for this record.</p>`}
            </article>
        `;
    }).join("");
}

async function load() {
    try {
        const session = await getValidUserSession();
        if (!session) {
            window.location.href = "../../login.html";
            return;
        }
        const orders = await getMyOrders();
        renderOrders(orders);

        const placed = new URLSearchParams(window.location.search).get("placed");
        if (placed) showMessage(`Your order ${placed} was placed successfully.`);
    } catch (error) {
        showMessage(error.message, true);
        $("ordersContainer").innerHTML = "";
    }
}

load();
