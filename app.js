
const express = require("express");
const { initializeDBAndServer, getDB } = require("./database/db");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Function to validate book ID
const isValidId = (id) => {
  return /^\d+$/.test(id) && Number(id) > 0;
};

// Function to validate book details
const isValidBook = (title, author, price) => {
  return (
    typeof title === "string" &&
    title.trim() !== "" &&
    typeof author === "string" &&
    author.trim() !== "" &&
    price !== undefined &&
    price !== null &&
    price !== "" &&
    typeof price !== "boolean" &&
    Number.isFinite(Number(price))
  );
};

const initializeDB = async () => {
  try {
    await initializeDBAndServer();
    const db = getDB();

    console.log("Database initialized successfully");

    // GET all books with search, sorting, pagination and price filtering
    app.get("/books", async (req, res) => {
      try {
        const {
          search_q,
          order_by,
          order,
          limit,
          offset,
          min_price,
          max_price
        } = req.query;

        // Validate numeric query parameters
        const numericParams = { limit, offset, min_price, max_price };

        for (const [key, value] of Object.entries(numericParams)) {
          if (value !== undefined) {
            if (
              typeof value !== "string" ||
              value.trim() === "" ||
              !Number.isFinite(Number(value))
            ) {
              return res.status(400).json({
                error: `${key} must be a valid number`
              });
            }
          }
        }

        const pageLimit = limit === undefined ? 10 : Number(limit);
        const pageOffset = offset === undefined ? 0 : Number(offset);

        if (
          !Number.isInteger(pageLimit) ||
          !Number.isInteger(pageOffset) ||
          pageLimit <= 0 ||
          pageOffset < 0
        ) {
          return res.status(400).json({
            error: "limit must be a positive integer and offset must be a non-negative integer"
          });
        }

        if (
          (min_price !== undefined && Number(min_price) < 0) ||
          (max_price !== undefined && Number(max_price) < 0)
        ) {
          return res.status(400).json({
            error: "Price values cannot be negative"
          });
        }

        if (
          min_price !== undefined &&
          max_price !== undefined &&
          Number(min_price) > Number(max_price)
        ) {
          return res.status(400).json({
            error: "min_price cannot be greater than max_price"
          });
        }

        let query = "SELECT * FROM books WHERE 1 = 1";
        const params = [];

        // Search by title
        if (search_q !== undefined && search_q.trim() !== "") {
          query += " AND title LIKE ?";
          params.push(`%${search_q.trim()}%`);
        }

        // Minimum price filter
        if (min_price !== undefined) {
          query += " AND price >= ?";
          params.push(Number(min_price));
        }

        // Maximum price filter
        if (max_price !== undefined) {
          query += " AND price <= ?";
          params.push(Number(max_price));
        }

        // Sorting
        const allowedColumns = ["id", "title", "author", "price"];

        const sortColumn = allowedColumns.includes(order_by)
          ? order_by
          : "id";

        const sortOrder =
          order === undefined || order === "ASC"
            ? "ASC"
            : order === "DESC"
              ? "DESC"
              : null;

        if (sortOrder === null) {
          return res.status(400).json({
            error: "order must be ASC or DESC"
          });
        }

        query += ` ORDER BY ${sortColumn} ${sortOrder}`;

        // Pagination
        query += " LIMIT ? OFFSET ?";
        params.push(pageLimit, pageOffset);

        const books = await db.all(query, params);

        return res.status(200).json(books);

      } catch (error) {
        console.error("GET books error:", error.message);
        return res.status(500).json({
          error: "Internal server error"
        });
      }
    });

    // GET a book by ID
    app.get("/books/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            error: "Invalid book ID"
          });
        }

        const book = await db.get(
          "SELECT * FROM books WHERE id = ?",
          [id]
        );

        if (!book) {
          return res.status(404).json({
            error: "Book not found"
          });
        }

        return res.status(200).json(book);

      } catch (error) {
        console.error("GET book by ID error:", error.message);
        return res.status(500).json({
          error: "Internal server error"
        });
      }
    });

    // POST a new book
    app.post("/books", async (req, res) => {
      try {
        const { title, author, price } = req.body || {};

        if (!isValidBook(title, author, price)) {
          return res.status(400).json({
            error: "Please provide a valid title, author and numeric price"
          });
        }

        const result = await db.run(
          `INSERT INTO books (title, author, price)
           VALUES (?, ?, ?)`,
          [title.trim(), author.trim(), Number(price)]
        );

        return res.status(201).json({
          message: "Book added successfully",
          bookId: result.lastID
        });

      } catch (error) {
        console.error("POST book error:", error.message);
        return res.status(500).json({
          error: "Internal server error"
        });
      }
    });

    // PUT update a book by ID
    app.put("/books/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { title, author, price } = req.body || {};

        if (!isValidId(id)) {
          return res.status(400).json({
            error: "Invalid book ID"
          });
        }

        if (!isValidBook(title, author, price)) {
          return res.status(400).json({
            error: "Please provide a valid title, author and numeric price"
          });
        }

        const result = await db.run(
          `UPDATE books
           SET title = ?, author = ?, price = ?
           WHERE id = ?`,
          [title.trim(), author.trim(), Number(price), id]
        );

        if (result.changes === 0) {
          return res.status(404).json({
            error: "Book not found"
          });
        }

        return res.status(200).json({
          message: "Book updated successfully"
        });

      } catch (error) {
        console.error("PUT book error:", error.message);
        return res.status(500).json({
          error: "Internal server error"
        });
      }
    });

    // DELETE a book by ID
    app.delete("/books/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            error: "Invalid book ID"
          });
        }

        const result = await db.run(
          "DELETE FROM books WHERE id = ?",
          [id]
        );

        if (result.changes === 0) {
          return res.status(404).json({
            error: "Book not found"
          });
        }

        return res.status(200).json({
          message: "Book deleted successfully"
        });

      } catch (error) {
        console.error("DELETE book error:", error.message);
        return res.status(500).json({
          error: "Internal server error"
        });
      }
    });

    // Home page
    app.get("/", (req, res) => {
      return res.status(200).send("Book Management API is running!");
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Database initialization error:", error.message);
  }
};

initializeDB();
