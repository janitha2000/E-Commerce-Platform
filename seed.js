
require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("./src/models/product");

const products = [
  {
    name: "Classic White T-Shirt",
    category: "Clothing",
    price: 2500,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
    description: "Comfortable everyday cotton T-shirt.",
    stock: 20
  },
  {
    name: "Elegant Black Handbag",
    category: "Accessories",
    price: 4500,
    image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85",
    description: "A stylish handbag for everyday use.",
    stock: 15
  },
  {
    name: "Casual Sneakers",
    category: "Footwear",
    price: 6500,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
    description: "Comfortable sneakers for casual outings.",
    stock: 10
  },
  {
    name: "Classic Wrist Watch",
    category: "Accessories",
    price: 5500,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85",
    description: "A simple watch with a classic design.",
    stock: 12
  },
  {
    name: "Blue Denim Jeans",
    category: "Clothing",
    price: 4000,
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85",
    description: "Versatile blue denim jeans.",
    stock: 18
  },
  {
    name: "Everyday Backpack",
    category: "Bags",
    price: 3500,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
    description: "A practical backpack for everyday essentials.",
    stock: 8
  }
];

async function seedProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    await Product.deleteMany({});
    await Product.insertMany(products);

    console.log("Sample products added successfully!");
    console.log(`${products.length} products inserted.`);
  } catch (error) {
    console.error("Error adding products:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

seedProducts();
