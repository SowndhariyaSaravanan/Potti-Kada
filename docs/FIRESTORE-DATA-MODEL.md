# Firestore Data Model – Potti kada

Potti kada uses **Firebase Cloud Firestore**, a NoSQL document database, to store application data.

## Collections Overview

| Collection | Purpose |
|---|---|
| `users` | Customer and admin profiles |
| `categories` | Product categories |
| `products` | Product details and inventory |
| `carts` | Customer shopping carts |
| `orders` | Customer order records |
| `sales` | Individual product sales records |

## 1. users

Stores user profile and account information. Document IDs are Firebase Authentication UIDs for registered users.

| Field | Type | Description |
|---|---|---|
| `name` | String | User's name |
| `email` | String | Email address |
| `mobile` | String | Mobile number |
| `role` | String | `admin` or `customer` |
| `isActive` | Boolean | Account status |
| `creditLimit` | Double | Maximum credit allowed |
| `creditUsed` | Double | Credit currently used |
| `createdAt` | Timestamp | Account creation time |
| `updatedAt` | Timestamp | Last update time |

## 2. categories

Stores product categories.

| Field | Type | Description |
|---|---|---|
| `name` | String | Category name |
| `description` | String | Category description |
| `isActive` | Boolean | Category availability |

## 3. products

Stores product information and inventory details.

| Field | Type | Description |
|---|---|---|
| `title` | String | Product name |
| `description` | String | Product description |
| `categoryId` | String | Referenced category ID |
| `price` | Double | Product price |
| `quantity` | Integer | Available stock |
| `imageUrl` | String | Product image URL |
| `isActive` | Boolean | Product availability |

## 4. carts

Stores individual customer shopping carts. The document ID represents the customer ID.

**Cart document fields:**

| Field | Type |
|---|---|
| `customerId` | String |
| `createdAt` | Timestamp |
| `updatedAt` | Timestamp |

Each cart contains a nested `items` subcollection.

**Cart item fields:**

| Field | Type |
|---|---|
| `productId` | String |
| `quantity` | Integer |
| `addedAt` | Timestamp |
| `updatedAt` | Timestamp |

## 5. orders

Stores completed customer orders.

| Field | Type | Description |
|---|---|---|
| `customerId` | String | Customer reference |
| `customerName` | String | Customer name |
| `customerEmail` | String | Customer email |
| `items` | Array of Maps | Purchased product details |
| `totalAmount` | Double | Total order amount |
| `paymentMethod` | String | `cash` or `credit` |
| `status` | String | Order status |
| `createdAt` | Timestamp | Order creation time |

Each object inside `items` contains:

- `productId`
- `productTitle`
- `quantity`
- `unitPrice`
- `lineTotal`

## 6. sales

Stores individual product sales records associated with orders.

| Field | Type | Description |
|---|---|---|
| `orderId` | String | Related order ID |
| `customerId` | String | Customer reference |
| `productId` | String | Product reference |
| `productTitle` | String | Product name |
| `categoryId` | String | Category reference |
| `quantity` | Integer | Quantity sold |
| `unitPrice` | Double | Price per unit |
| `lineTotal` | Double | Total for the product |
| `paymentMethod` | String | Payment method |
| `createdAt` | Timestamp | Sale creation time |

## Relationships

```text
users
  |
  +---- carts
  |
  +---- orders
           |
           +---- sales

categories
  |
  +---- products
           |
           +---- sales
```

- A user can have a cart and multiple orders.
- A category can contain multiple products.
- An order can contain multiple purchased items.
- Each sale record corresponds to a product sold in an order.
- References are maintained using document IDs rather than SQL foreign keys.

## Important Notes

- Firestore is a NoSQL document database; it does not use relational tables or SQL joins.
- Cart items are stored in a nested subcollection.
- Order items are stored as an array of maps inside the order document.
- Product stock and customer credit usage are updated during checkout.
- Creating a document in the `users` collection does not automatically create a Firebase Authentication account.
- Firestore Security Rules should restrict access according to authenticated users and their roles.