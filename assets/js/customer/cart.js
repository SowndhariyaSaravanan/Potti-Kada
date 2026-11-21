import {
    getCart,
    updateCartItemQuantity,
    removeFromCart
} from "../services/cart-service.js";
import {
    getValidUserSession,
    getUserProfile
} from "../services/auth-service.js";
import { placeOrder } from "../services/order-service.js";
import { sendOrderConfirmation } from "../services/email-service.js";

const $ = id => document.getElementById(id);
let cart = [];
let profile = null;

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

function message(text, isError = false) {
    $("cartMessage").textContent = text;
    $("cartMessage").classList.toggle("error", isError);
}

function renderCart() {
    const body = $("cartItems");
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const count = cart.reduce((sum, item) => sum + Number(item.quantity), 0);

    $("cartCount").textContent = count;
    $("cartTotal").textContent = currency(total);

    if (!cart.length) {
        body.innerHTML = `<tr><td colspan="5" class="customer-empty">Your cart is empty. <a href="./products.html">Browse products</a>.</td></tr>`;
        $("placeOrderButton").disabled = true;
        return;
    }

    $("placeOrderButton").disabled = false;
    body.innerHTML = cart.map(item => `
        <tr>
            <td>${escapeHTML(item.title)}</td>
            <td>${currency(item.price)}</td>
            <td>
                <input class="cart-quantity-input" type="number" min="1"
                    value="${Number(item.quantity)}"
                    data-product-id="${escapeHTML(item.productId)}"
                    aria-label="Quantity for ${escapeHTML(item.title)}">
            </td>
            <td>${currency(Number(item.price) * Number(item.quantity))}</td>
            <td>
                <button class="customer-remove-button" type="button"
                    data-remove-id="${escapeHTML(item.productId)}">Remove</button>
            </td>
        </tr>
    `).join("");
}

async function load() {
    try {
        cart = await getCart();
        renderCart();

        const session = await getValidUserSession();
        if (!session) {
            $("checkoutControls").hidden = true;
            $("guestNotice").hidden = false;
            return;
        }

        profile = await getUserProfile(session.uid, session.idToken);
        if (profile.role !== "customer" || !profile.isActive) {
            throw new Error("An active customer account is required to checkout.");
        }

        const available = Number(profile.creditLimit || 0) - Number(profile.creditUsed || 0);
        $("creditInfo").textContent =
            `Available credit: ${currency(available)} (Credit limit: ${currency(profile.creditLimit)}).`;
    } catch (error) {
        message(error.message, true);
    }
}

$("cartItems").addEventListener("change", async event => {
    const input = event.target.closest("[data-product-id]");
    if (!input) return;
    try {
        await updateCartItemQuantity(input.dataset.productId, Number(input.value));
        cart = await getCart();
        renderCart();
        message("Cart updated.");
    } catch (error) {
        message(error.message, true);
        cart = await getCart();
        renderCart();
    }
});

$("cartItems").addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-id]");
    if (!button) return;
    try {
        await removeFromCart(button.dataset.removeId);
        cart = await getCart();
        renderCart();
        message("Item removed.");
    } catch (error) {
        message(error.message, true);
    }
});

$("paymentMethod").addEventListener("change", () => {
    $("creditInfo").classList.toggle("credit-selected", $("paymentMethod").value === "credit");
});

$("placeOrderButton").addEventListener("click", async () => {
    const button = $("placeOrderButton");
    try {
        button.disabled = true;
        button.textContent = "Placing Order...";

        const result = await placeOrder($("paymentMethod").value);

        // Order is already safely committed to Firestore.
        // Email failure must not undo the successful order.
        cart = [];
        renderCart();

        try {
            await sendOrderConfirmation(result, {
                name: profile.name,
                email: profile.email
            });
            console.log("Order confirmation email sent.");
        } catch (emailError) {
            console.error("ORDER WAS PLACED, BUT EMAIL FAILED!");
            console.error("Error message:", emailError.message);
            console.error("Full error:", emailError);
            alert("Order placed successfully, but email failed: " + emailError.message);
        }

        window.location.href =
            `./orders.html?placed=${encodeURIComponent(result.orderId)}`;

    } catch (error) {
        message(error.message, true);
        button.disabled = false;
        button.textContent = "Place Order";
    }
});

load();
