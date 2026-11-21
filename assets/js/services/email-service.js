
const EMAILJS_CONFIG = {
    serviceId: "service_0zlp65m",
    templateId: "template_qzpennt",
    publicKey: "CnRzLnFkajscgkO48"
};

export async function sendOrderConfirmation(order, customer) {
    const currency = value =>
        Number(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const orderItems = order.items.map(item =>
        `${item.title} | Qty: ${item.quantity} | ₹${currency(item.price)} | Line total: ₹${currency(item.price * item.quantity)}`
    ).join("\n");

    const templateParams = {
        customer_name: customer.name,
        customer_email: customer.email,
        order_id: order.orderId,
        order_date: new Date(order.createdAt).toLocaleString("en-IN"),
        payment_method: order.paymentMethod.toUpperCase(),
        order_items: orderItems,
        total_amount: currency(order.totalAmount)
    };

    const response = await fetch(
        "https://api.emailjs.com/api/v1.0/email/send",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                service_id: EMAILJS_CONFIG.serviceId,
                template_id: EMAILJS_CONFIG.templateId,
                user_id: EMAILJS_CONFIG.publicKey,
                template_params: templateParams
            })
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Unable to send order confirmation email.");
    }

    return true;
}
