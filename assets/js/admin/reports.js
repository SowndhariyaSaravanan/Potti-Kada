
import { getAdminReportData } from "../services/report-service.js";

const $ = id => document.getElementById(id);

const fromDateInput = $("fromDate");
const toDateInput = $("toDate");
const reportMessage = $("reportMessage");

let reportData = {
    customers: [],
    products: [],
    orders: [],
    sales: []
};

function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function currency(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(number(value));
}

function dateValue(value) {
    if (!value) return null;

    // Firestore timestamp may be a string or an object
    const rawValue =
        typeof value === "object" && value !== null
            ? value.timestampValue || value
            : value;

    const date = new Date(rawValue);

    return Number.isNaN(date.getTime()) ? null : date;
}


function displayDate(value) {
    const date = dateValue(value);
    return date ? date.toLocaleDateString("en-IN") : "-";
}

function isWithinDateRange(value) {
    const date = dateValue(value);

    if (!fromDateInput.value && !toDateInput.value) {
        return true;
    }

    if (!date) return false;

    // Compare date-only values to avoid timezone issues
    const recordDate = date.toISOString().slice(0, 10);

    if (fromDateInput.value && recordDate < fromDateInput.value) {
        return false;
    }

    if (toDateInput.value && recordDate > toDateInput.value) {
        return false;
    }

    return true;
}

function filteredOrders() {
    return reportData.orders.filter(order =>
        isWithinDateRange(order.createdAt)
    );
}

function filteredSales() {
    return reportData.sales.filter(sale =>
        isWithinDateRange(sale.createdAt)
    );
}

function paymentType(value) {
    return String(value || "").trim().toLowerCase();
}

function setRows(elementId, rows, emptyMessage = "No records found.") {
    const tbody = $(elementId);
    tbody.replaceChildren();

    if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = 10;
        td.textContent = emptyMessage;

        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    rows.forEach(values => {
        const tr = document.createElement("tr");

        values.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value ?? "-";
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

function renderCustomers() {
    const customers = reportData.customers;

    setRows("allCustomersBody", customers.map(customer => [
        customer.id,
        customer.name,
        customer.email,
        customer.mobile,
        currency(customer.creditLimit),
        currency(customer.creditUsed),
        customer.isActive ? "Active" : "Inactive"
    ]));

    const orders = filteredOrders();
    const purchases = new Map();

    orders.forEach(order => {
        const customerId = order.customerId;
        if (!customerId) return;

        const current = purchases.get(customerId) || {
            name: order.customerName || customerId,
            total: 0
        };

        current.total += number(order.total);
        purchases.set(customerId, current);
    });

    const topCustomers = [...purchases.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

    setRows("topCustomersBody", topCustomers.map(([id, data], index) => [
        index + 1,
        id,
        data.name,
        currency(data.total)
    ]));

    const customerPayments = new Map();

    orders.forEach(order => {
        const id = order.customerId;
        if (!id) return;

        const current = customerPayments.get(id) || {
            name: order.customerName || id,
            cash: 0,
            credit: 0
        };

        const method = paymentType(order.paymentMethod);

        if (method === "cash") {
            current.cash += number(order.total);
        } else if (method === "credit") {
            current.credit += number(order.total);
        }

        customerPayments.set(id, current);
    });

    const paymentRows = [...customerPayments.entries()]
        .sort((a, b) =>
            (b[1].cash + b[1].credit) - (a[1].cash + a[1].credit)
        )
        .map(([id, data]) => [
            id,
            data.name,
            currency(data.cash),
            currency(data.credit),
            currency(data.cash + data.credit)
        ]);

    setRows("customerPaymentBody", paymentRows);
}

function renderInventory() {
    const products = reportData.products;

    setRows("inventoryBody", products.map(product => [
        product.id,
        product.title,
        product.categoryId,
        number(product.quantity),
        currency(product.price),
        product.isActive ? "Active" : "Inactive"
    ]));

    const categories = new Map();

    products.forEach(product => {
        const categoryId = product.categoryId || "Uncategorised";

        const current = categories.get(categoryId) || {
            count: 0,
            quantity: 0
        };

        current.count++;
        current.quantity += number(product.quantity);

        categories.set(categoryId, current);
    });

    setRows("categoryStockBody", [...categories.entries()].map(
        ([categoryId, data]) => [
            categoryId,
            data.count,
            data.quantity
        ]
    ));

    const highStock = products.filter(
        product => number(product.quantity) > 100
    );

    const lowStock = products.filter(
        product => number(product.quantity) < 15
    );

    setRows("highStockBody", highStock.map(product => [
        product.title,
        number(product.quantity)
    ]));

    setRows("lowStockBody", lowStock.map(product => [
        product.title,
        number(product.quantity)
    ]));
}

function renderSales() {
    const sales = filteredSales();

    setRows("salesBody", sales.map(sale => [
        sale.id,
        sale.orderId,
        sale.productTitle,
        sale.categoryId,
        sale.customerId,
        number(sale.quantity),
        currency(sale.lineTotal),
        sale.paymentMethod || "-",
        displayDate(sale.createdAt)
    ]));

    const categorySales = new Map();

    sales.forEach(sale => {
        const categoryId = sale.categoryId || "Uncategorised";

        const current = categorySales.get(categoryId) || {
            quantity: 0,
            amount: 0
        };

        current.quantity += number(sale.quantity);
        current.amount += number(sale.lineTotal);

        categorySales.set(categoryId, current);
    });

    setRows("categorySalesBody", [...categorySales.entries()].map(
        ([categoryId, data]) => [
            categoryId,
            data.quantity,
            currency(data.amount)
        ]
    ));

    const paymentSales = new Map([
        ["cash", { quantity: 0, amount: 0 }],
        ["credit", { quantity: 0, amount: 0 }]
    ]);

    sales.forEach(sale => {
        const method = paymentType(sale.paymentMethod);

        if (!paymentSales.has(method)) {
            paymentSales.set(method, { quantity: 0, amount: 0 });
        }

        const current = paymentSales.get(method);
        current.quantity += number(sale.quantity);
        current.amount += number(sale.lineTotal);
    });

    setRows("paymentSalesBody", [...paymentSales.entries()].map(
        ([method, data]) => [
            method.toUpperCase(),
            data.quantity,
            currency(data.amount)
        ]
    ));

    const productSales = new Map();

    // Include all products so unsold products can appear in the bottom 10.
    reportData.products.forEach(product => {
        productSales.set(product.id, {
            title: product.title,
            quantity: 0,
            revenue: 0
        });
    });

    sales.forEach(sale => {
        const id = sale.productId;
        if (!id) return;

        const current = productSales.get(id) || {
            title: sale.productTitle || id,
            quantity: 0,
            revenue: 0
        };

        current.quantity += number(sale.quantity);
        current.revenue += number(sale.lineTotal);

        productSales.set(id, current);
    });

    const products = [...productSales.values()];

    const topProducts = [...products]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const bottomProducts = [...products]
        .sort((a, b) => a.revenue - b.revenue)
        .slice(0, 10);

    const productRows = list => list.map(product => [
        product.title,
        product.quantity,
        currency(product.revenue)
    ]);

    setRows("topProductsBody", productRows(topProducts));
    setRows("bottomProductsBody", productRows(bottomProducts));

    const total = sales.reduce(
        (sum, sale) => sum + number(sale.lineTotal),
        0
    );

    $("totalSales").textContent = currency(total);
}

function renderAllReports() {
    renderCustomers();
    renderInventory();
    renderSales();

    reportMessage.textContent =
        `Reports updated. ${reportData.customers.length} customers, ` +
        `${reportData.products.length} products, ` +
        `${reportData.orders.length} orders and ` +
        `${reportData.sales.length} sales records loaded.`;
}

$("applyFilterBtn").addEventListener("click", () => {
    if (
        fromDateInput.value &&
        toDateInput.value &&
        fromDateInput.value > toDateInput.value
    ) {
        reportMessage.textContent =
            "The From date cannot be later than the To date.";
        return;
    }

    renderAllReports();
});

$("clearFilterBtn").addEventListener("click", () => {
    fromDateInput.value = "";
    toDateInput.value = "";
    renderAllReports();
});

async function initializeReports() {
    try {
        reportMessage.textContent = "Loading report data...";

        reportData = await getAdminReportData();

        renderAllReports();

    } catch (error) {
        console.error("Admin reports loading failed:", error);

        reportMessage.textContent =
            `Unable to load reports: ${error.message}`;
    }
}

initializeReports();
